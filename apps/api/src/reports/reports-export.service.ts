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
    doc.fontSize(11);
    doc.text(`Station: ${report.stationId ?? 'All stations'}`);
    doc.text(`Date: ${report.date}`);
    doc.moveDown();
    doc.text(`Total fill-ups: ${report.totalFillUps}`);
    doc.text(`Total liters: ${report.totalLiters}`);
    doc.text(`Exceptions pending: ${report.exceptionsPending}`);
    doc.text(`Exceptions approved: ${report.exceptionsApproved}`);
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
    doc.fontSize(9);

    for (const row of rows) {
      const plain = this.violationRowToPlainObject(row);
      doc.text(
        `${plain.date} | ${plain.station} | ${plain.vehicle} | ${plain.driver} | ${plain.exceptionType} | ${plain.status} | ${plain.reason}`,
      );
    }
    if (rows.length === 0) {
      doc.text('No violations match this filter.');
    }
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
