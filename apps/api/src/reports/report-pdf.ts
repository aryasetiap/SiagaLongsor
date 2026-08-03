import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface ReportPdfInput {
  readonly siteName: string;
  readonly siteTimezone: string;
  readonly from: Date;
  readonly to: Date;
  readonly generatedAt: Date;
  readonly createdByName: string;
  readonly telemetry: {
    readonly count: number;
    readonly averageTiltMagnitudeDeg: string | null;
    readonly averageSoilMoisturePct: string | null;
    readonly averageRainfallMmHour: string | null;
    readonly averageBatteryVoltage: string | null;
  };
  readonly riskCounts: Readonly<Record<'SAFE' | 'WATCH' | 'DANGER' | 'UNKNOWN', number>>;
  readonly alertCounts: Readonly<
    Record<'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_ALARM', number>
  >;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 52;

export async function generateSitePeriodSummaryPdf(input: ReportPdfInput): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.setTitle(`Laporan periode ${input.siteName}`);
  document.setAuthor('SiagaLongsor');
  document.setCreator('SiagaLongsor Backend Reports');
  document.setProducer('SiagaLongsor');
  document.setCreationDate(input.generatedAt);
  document.setModificationDate(input.generatedAt);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfTextWriter(document, regular, bold);

  writer.heading('Laporan Ringkasan Periode Site');
  writer.line(`Site: ${safeText(input.siteName)}`);
  writer.line(`Zona waktu Site: ${safeText(input.siteTimezone)}`);
  writer.line(`Periode [from,to): ${input.from.toISOString()} - ${input.to.toISOString()}`);
  writer.line(`Dibuat pada: ${input.generatedAt.toISOString()}`);
  writer.line(`Diminta oleh: ${safeText(input.createdByName)}`);
  writer.space();

  writer.subheading('Batasan data');
  writer.paragraph(
    'Laporan ini hanya merangkum histori Telemetry, RiskAssessment, dan Alert yang tersimpan. Nilai yang tidak tersedia tidak direka, tidak diinterpolasi, dan UNKNOWN tidak diubah menjadi SAFE.',
  );
  writer.paragraph(
    'Laporan ini bukan kesimpulan geoteknis, rekomendasi keadaan darurat, prosedur evakuasi, atau pengganti SOP.',
  );

  writer.subheading('Ringkasan Telemetry tersimpan');
  writer.line(`Jumlah sampel: ${input.telemetry.count}`);
  writer.line(`Rata-rata tiltMagnitudeDeg: ${present(input.telemetry.averageTiltMagnitudeDeg)}`);
  writer.line(`Rata-rata soilMoisturePct: ${present(input.telemetry.averageSoilMoisturePct)}`);
  writer.line(`Rata-rata rainfallMmHour: ${present(input.telemetry.averageRainfallMmHour)}`);
  writer.line(`Rata-rata batteryVoltage: ${present(input.telemetry.averageBatteryVoltage)}`);

  writer.subheading('Ringkasan RiskAssessment tersimpan');
  for (const risk of ['SAFE', 'WATCH', 'DANGER', 'UNKNOWN'] as const) {
    writer.line(`${risk}: ${input.riskCounts[risk]}`);
  }

  writer.subheading('Ringkasan Alert tersimpan');
  for (const status of ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_ALARM'] as const) {
    writer.line(`${status}: ${input.alertCounts[status]}`);
  }

  return Buffer.from(await document.save({ addDefaultPage: false, useObjectStreams: false }));
}

function present(value: string | null): string {
  return value ?? 'Tidak tersedia';
}

function safeText(value: string): string {
  return value.replaceAll(/[\r\n\t]/g, ' ').replaceAll(/[^\x20-\x7E]/g, '?');
}

class PdfTextWriter {
  private page!: PDFPage;
  private y = 0;

  constructor(
    private readonly document: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  heading(value: string): void {
    this.write(value, 18, this.bold, 26);
  }

  subheading(value: string): void {
    this.space();
    this.write(value, 12, this.bold, 19);
  }

  line(value: string): void {
    this.write(value, 10, this.regular, 15);
  }

  paragraph(value: string): void {
    for (const line of wrap(value, 88)) this.line(line);
    this.space(4);
  }

  space(points = 8): void {
    this.y -= points;
  }

  private write(value: string, size: number, font: PDFFont, lineHeight: number): void {
    if (this.y - lineHeight < MARGIN) this.newPage();
    this.page.drawText(safeText(value), {
      x: MARGIN,
      y: this.y,
      size,
      font,
      color: rgb(0.08, 0.12, 0.18),
    });
    this.y -= lineHeight;
  }

  private newPage(): void {
    this.page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }
}

function wrap(value: string, maximum: number): readonly string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length > 0 && current.length + word.length + 1 > maximum) {
      lines.push(current);
      current = word;
    } else {
      current = current.length === 0 ? word : `${current} ${word}`;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
