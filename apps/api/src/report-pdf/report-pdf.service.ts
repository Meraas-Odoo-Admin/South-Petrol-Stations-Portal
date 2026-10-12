import { Injectable } from '@nestjs/common';
import { CardRendererService } from '../cards/render/card-renderer.service';
import { loadCardAssets } from '../cards/render/card-assets';
import { buildReportHtml, type PdfReport } from './report-pdf.html';

// Report PDFs, rendered by the same offline Chromium and bundled Cairo font as
// the vehicle card (phase 3), so Arabic is shaped and ordered correctly.
@Injectable()
export class ReportPdfService {
  constructor(private readonly renderer: CardRendererService) {}

  render(report: PdfReport): Promise<Buffer> {
    return this.renderer.renderA4Pdf(buildReportHtml(report, loadCardAssets().fontFaceCss));
  }
}
