import { Injectable } from '@nestjs/common';
import { ReportPdfService } from '../report-pdf/report-pdf.service';
import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';

// Both formats are generated synchronously, on request, when the export
// endpoint is hit — no background job/queue. Fine at this scale (a single
// day/station's worth of data, or a filtered violations slice); revisit if
// real usage proves export volume/latency actually needs one.
export const EXPORT_ROW_LIMIT = 5000;

// Dates in the PDF read in Tripoli time.
const TRIPOLI_STAMP = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Tripoli',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

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
        vehicle: {
          select: {
            id: true;
            internalCode: true;
            currentPlate: true;
            owner: { select: { id: true; identityType: true; identityNumber: true; fullName: true } };
          };
        };
        // Legacy-only (round 6) — see FILL_UP_HISTORY_INCLUDE's comment.
        driver: { select: { id: true; identityType: true; identityNumber: true; fullName: true } };
        station: { select: { id: true; internalCode: true; name: true } };
      };
    };
  };
}>;

@Injectable()
export class ReportsExportService {
  // PDFs go through the offline Chromium renderer with the bundled Cairo font: pdfkit has no Arabic shaping, so Arabic names and reasons came out blank there.
  constructor(private readonly pdf: ReportPdfService) {}

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
    return this.pdf.render({
      title: 'تقرير التعبئة اليومي',
      subtitle: [`المحطة: ${report.stationId ?? 'كل المحطات'}`, `التاريخ: ${report.date}`],
      tables: [
        {
          headers: ['البند', 'القيمة'],
          rows: [
            ['إجمالي التعبئات', report.totalFillUps],
            ['إجمالي اللترات', report.totalLiters],
            ['الاستثناءات بانتظار الاعتماد', report.exceptionsPending],
            ['الاستثناءات المعتمدة', report.exceptionsApproved],
          ],
        },
      ],
    });
  }

  async violationsToXlsx(rows: ExceptionExportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Violations');
    sheet.columns = [
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Station', key: 'station', width: 20 },
      { header: 'Vehicle', key: 'vehicle', width: 18 },
      { header: 'Owner', key: 'owner', width: 24 },
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
    return this.pdf.render({
      title: 'المخالفات والاستثناءات',
      landscape: true,
      tables: [
        {
          headers: ['التاريخ', 'المحطة', 'المركبة', 'المالك', 'نوع الاستثناء', 'الحالة', 'السبب'],
          rows: rows.map((row) => {
            const plain = this.violationRowToPlainObject(row);
            return [
              TRIPOLI_STAMP.format(new Date(plain.date)).replace(',', ''),
              plain.station,
              plain.vehicle.replace('(unregistered)', '(غير مسجلة)'),
              plain.owner,
              plain.exceptionType,
              plain.status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد',
              plain.reason,
            ];
          }),
          emptyText: 'لا توجد مخالفات تطابق هذا الفلتر.',
        },
      ],
    });
  }

  // Deliberately excludes owner.identityNumber (and identityType), even
  // though the underlying query fetches it (ReportsService's
  // FILL_UP_HISTORY_INCLUDE is shared with the vehicle-history JSON
  // endpoint, which DOES need it). §8's masking rule is UI-only for the
  // JSON endpoint because there's a frontend downstream to apply it — an
  // exported file has no such step; whoever opens it sees exactly what's
  // written here, permanently. owner.fullName is fine to keep (not the
  // sensitive part); the identity number itself never reaches either
  // export format. Do not add it back without re-deciding this.
  //
  // Round 6: "Owner" replaces "Driver" as the export column — falls back
  // to the legacy driver.fullName only for pre-round-6 fill-ups that have
  // no vehicle owner set at all.
  private violationRowToPlainObject(row: ExceptionExportRow) {
    return {
      date: row.fillUpTransaction.occurredAt.toISOString(),
      station: row.fillUpTransaction.station.internalCode,
      // Phase 4a: a fill-up for an unregistered plate has no vehicle record —
      // it shows the plate as typed, marked as unregistered, and no owner.
      vehicle: row.fillUpTransaction.vehicle
        ? row.fillUpTransaction.vehicle.currentPlate
        : `${row.fillUpTransaction.typedPlate ?? '—'} (unregistered)`,
      owner: row.fillUpTransaction.vehicle?.owner?.fullName ?? row.fillUpTransaction.driver?.fullName ?? '—',
      exceptionType: row.exceptionType.name,
      reason: row.reason,
      status: row.approvedById ? 'approved' : 'pending',
    };
  }
}
