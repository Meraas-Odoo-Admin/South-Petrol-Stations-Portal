import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';

// Both formats are generated synchronously, on request, when the export
// endpoint is hit — no background job/queue. Fine at this scale (a single
// day/station's worth of data, or a filtered violations slice); revisit if
// real usage proves export volume/latency actually needs one.
export const EXPORT_ROW_LIMIT = 5000;

type DailyReport = {
  stationId: string | null;
  date: string;
  totalFillUps: number;
  totalLiters: number;
  exceptionsPending: number;
  exceptionsApproved: number;
};

type ExceptionExportRow = Prisma.ExceptionGetPayload<{
  include: {
    exceptionType: true;
    fillUpTransaction: {
      include: {
        vehicle: { select: { id: true; internalCode: true; currentPlate: true } };
        driver: { select: { id: true; identityType: true; identityNumber: true; fullName: true } };
        station: { select: { id: true; internalCode: true; name: true } };
      };
    };
  };
}>;

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

interface PdfTableColumn {
  header: string;
  width: number;
}

// Item 14: PDF exports previously rendered each row as one pipe-delimited
// text line (`doc.text(\`${a} | ${b} | ...\`)`) — readable but not a table:
// no column alignment, no header emphasis, nothing that survives being
// printed or resized. This draws an actual bordered/ruled table, wrapping
// to a new page (with the header re-drawn) when a page fills up, same as
// any real report generator would.
function drawPdfTable(
  doc: PDFKit.PDFDocument,
  columns: PdfTableColumn[],
  rows: string[][],
  startY: number,
): void {
  const left = doc.page.margins.left;
  const rowHeight = 20;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  function drawHeader(y: number): number {
    let x = left;
    doc.font('Helvetica-Bold').fontSize(9);
    for (const col of columns) {
      doc.text(col.header, x + 2, y + 4, { width: col.width - 4, ellipsis: true });
      x += col.width;
    }
    doc
      .moveTo(left, y + rowHeight)
      .lineTo(x, y + rowHeight)
      .lineWidth(0.75)
      .stroke();
    return y + rowHeight;
  }

  let y = drawHeader(startY);
  doc.font('Helvetica').fontSize(9);

  for (const row of rows) {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
      doc.font('Helvetica').fontSize(9);
    }
    let x = left;
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i]!;
      doc.text(row[i] ?? '', x + 2, y + 4, { width: col.width - 4, ellipsis: true });
      x += col.width;
    }
    doc
      .moveTo(left, y + rowHeight)
      .lineTo(x, y + rowHeight)
      .lineWidth(0.25)
      .stroke('#cccccc');
    y += rowHeight;
  }
}

@Injectable()
export class ReportsExportService {
  async dailyReportToXlsx(report: DailyReport): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily Report');
    sheet.columns = [
      { header: 'Field', key: 'field', width: 24 },
      { header: 'Value', key: 'value', width: 24 },
    ];
    sheet.addRows([
      { field: 'Station', value: report.stationId ?? 'All stations' },
      { field: 'Date', value: report.date },
      { field: 'Total fill-ups', value: report.totalFillUps },
      { field: 'Total liters', value: report.totalLiters },
      { field: 'Exceptions pending', value: report.exceptionsPending },
      { field: 'Exceptions approved', value: report.exceptionsApproved },
    ]);
    sheet.getRow(1).font = { bold: true };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async dailyReportToPdf(report: DailyReport): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50 });
    doc.fontSize(16).text('Daily Fill-Up Report', { underline: true });
    doc.moveDown();
    doc.fontSize(11).font('Helvetica');
    doc.text(`Station: ${report.stationId ?? 'All stations'}`);
    doc.text(`Date: ${report.date}`);
    doc.moveDown();

    drawPdfTable(
      doc,
      [
        { header: 'Field', width: 220 },
        { header: 'Value', width: 220 },
      ],
      [
        ['Total fill-ups', String(report.totalFillUps)],
        ['Total liters', String(report.totalLiters)],
        ['Exceptions pending', String(report.exceptionsPending)],
        ['Exceptions approved', String(report.exceptionsApproved)],
      ],
      doc.y,
    );

    return pdfToBuffer(doc);
  }

  async violationsToXlsx(rows: ExceptionExportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Violations');
    sheet.columns = [
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Station', key: 'station', width: 20 },
      { header: 'Vehicle', key: 'vehicle', width: 18 },
      { header: 'Driver', key: 'driver', width: 24 },
      { header: 'Exception Type', key: 'exceptionType', width: 20 },
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    for (const row of rows) {
      sheet.addRow(this.violationRowToPlainObject(row));
    }
    sheet.getRow(1).font = { bold: true };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async violationsToPdf(rows: ExceptionExportRow[]): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    doc.fontSize(16).text('Violations / Exceptions', { underline: true });
    doc.moveDown();

    if (rows.length === 0) {
      doc.fontSize(11).font('Helvetica').text('No violations match this filter.');
      return pdfToBuffer(doc);
    }

    drawPdfTable(
      doc,
      [
        { header: 'Date', width: 110 },
        { header: 'Station', width: 90 },
        { header: 'Vehicle', width: 90 },
        { header: 'Driver', width: 130 },
        { header: 'Exception Type', width: 110 },
        { header: 'Status', width: 70 },
        { header: 'Reason', width: 200 },
      ],
      rows.map((row) => {
        const plain = this.violationRowToPlainObject(row);
        return [plain.date, plain.station, plain.vehicle, plain.driver, plain.exceptionType, plain.status, plain.reason];
      }),
      doc.y,
    );

    return pdfToBuffer(doc);
  }

  // Deliberately excludes driver.identityNumber (and identityType), even
  // though the underlying query fetches it (ReportsService's
  // FILL_UP_HISTORY_INCLUDE is shared with the driver/vehicle history JSON
  // endpoints, which DO need it). §8's masking rule is UI-only for the JSON
  // endpoints because there's a frontend downstream to apply it — an
  // exported file has no such step; whoever opens it sees exactly what's
  // written here, permanently. driver.fullName is fine to keep (not the
  // sensitive part); the identity number itself never reaches either
  // export format. Do not add it back without re-deciding this.
  private violationRowToPlainObject(row: ExceptionExportRow) {
    return {
      date: row.fillUpTransaction.occurredAt.toISOString(),
      station: row.fillUpTransaction.station.internalCode,
      vehicle: row.fillUpTransaction.vehicle.currentPlate,
      driver: row.fillUpTransaction.driver.fullName,
      exceptionType: row.exceptionType.name,
      reason: row.reason,
      status: row.approvedById ? 'approved' : 'pending',
    };
  }
}
