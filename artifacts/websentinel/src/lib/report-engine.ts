/**
 * report-engine.ts
 *
 * Comprehensive, professional-grade PDF security assessment report generator.
 * Built on jsPDF + jspdf-autotable. Pure data-in / PDF-out — no React deps.
 *
 * Sections produced (all optional via ReportOptions):
 *  1. Cover page
 *  2. Executive Summary
 *  3. Subdomain Enumeration & Asset Inventory
 *  4. Certificate Transparency Analysis
 *  5. DNS Analysis
 *  6. HTTPS / TLS Assessment
 *  7. Security Headers
 *  8. Security Findings (detailed)
 *  9. Risk Assessment & Scoring
 * 10. Risk Mitigation & Remediation
 * 11. Analytics & Statistics
 * 12. Technical Appendices
 */

// @ts-ignore — jspdf-autotable augments jsPDF at runtime
import autoTable from 'jspdf-autotable';
import { jsPDF } from 'jspdf';
import type {
  ScanRecord,
  SubdomainScanRecord,
  TlsScanRecord,
  SubdomainEntry,
  Finding,
  SourceSummary,
  TlsCertInfo,
  SecurityHeaderInfo,
} from './scans';
import { scoreFromTlsScan, elapsedLabel, relativeTime } from './scans';

// ── Palette ────────────────────────────────────────────────────────────────────

const C = {
  navy:       [8,  17, 31]   as [number,number,number],
  navyMid:    [14, 26, 47]   as [number,number,number],
  navyLight:  [21, 37, 65]   as [number,number,number],
  blue:       [67, 140, 255] as [number,number,number],
  blueLight:  [100,170,255]  as [number,number,number],
  white:      [237,243,255]  as [number,number,number],
  muted:      [116,130,153]  as [number,number,number],
  border:     [32, 42, 60]   as [number,number,number],
  critical:   [239,68,68]    as [number,number,number],
  high:       [245,158,11]   as [number,number,number],
  medium:     [139,92,246]   as [number,number,number],
  low:        [59,130,246]   as [number,number,number],
  info:       [148,163,184]  as [number,number,number],
  green:      [52,211,153]   as [number,number,number],
  greenDark:  [16,185,129]   as [number,number,number],
  red:        [239,68,68]    as [number,number,number],
  amber:      [245,158,11]   as [number,number,number],
  pageText:   [30, 30, 50]   as [number,number,number],
  pageMuted:  [80, 90, 115]  as [number,number,number],
  pageBorder: [200,210,230]  as [number,number,number],
  pageBg:     [248,250,255]  as [number,number,number],
  tableHead:  [30, 40, 70]   as [number,number,number],
  tableRow1:  [245,248,255]  as [number,number,number],
  tableRow2:  [255,255,255]  as [number,number,number],
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReportOptions {
  sections: {
    executiveSummary: boolean;
    subdomainEnumeration: boolean;
    certTransparency: boolean;
    dnsAnalysis: boolean;
    tlsAssessment: boolean;
    securityHeaders: boolean;
    findings: boolean;
    riskAssessment: boolean;
    mitigation: boolean;
    analytics: boolean;
    historicalComparison: boolean;
    appendices: boolean;
  };
  targetDomain: string;
  assessorName: string;
  organizationName: string;
  reportClassification: 'Confidential' | 'Internal' | 'Public';
  includeRawData: boolean;
}

export const DEFAULT_OPTIONS: ReportOptions = {
  sections: {
    executiveSummary: true,
    subdomainEnumeration: true,
    certTransparency: true,
    dnsAnalysis: true,
    tlsAssessment: true,
    securityHeaders: true,
    findings: true,
    riskAssessment: true,
    mitigation: true,
    analytics: true,
    historicalComparison: true,
    appendices: true,
  },
  targetDomain: '',
  assessorName: 'WebSentinel Scanner',
  organizationName: 'WebSentinel Security',
  reportClassification: 'Confidential',
  includeRawData: true,
};

interface ReportContext {
  pdf: jsPDF;
  opts: ReportOptions;
  scans: ScanRecord[];
  subScans: SubdomainScanRecord[];
  tlsScans: TlsScanRecord[];
  allFindings: Finding[];
  latestTls: TlsScanRecord | undefined;
  latestSub: SubdomainScanRecord | undefined;
  pageW: number;
  pageH: number;
  margin: number;
  contentW: number;
  toc: Array<{ title: string; page: number }>;
  reportId: string;
  generatedAt: string;
  /** Current Y cursor (mm from top) — managed manually */
  y: number;
}

// ── PDF helpers ────────────────────────────────────────────────────────────────

function initCtx(pdf: jsPDF, opts: ReportOptions, scans: ScanRecord[], allFindings: Finding[]): ReportContext {
  const subScans = scans.filter((s): s is SubdomainScanRecord => s.type === 'subdomain');
  const tlsScans = scans.filter((s): s is TlsScanRecord       => s.type === 'tls');
  return {
    pdf,
    opts,
    scans,
    subScans,
    tlsScans,
    allFindings,
    latestTls: tlsScans[0],
    latestSub: subScans[0],
    pageW: pdf.internal.pageSize.getWidth(),
    pageH: pdf.internal.pageSize.getHeight(),
    margin: 18,
    contentW: pdf.internal.pageSize.getWidth() - 36,
    toc: [],
    reportId: `WS-RPT-${Date.now().toString(36).toUpperCase()}`,
    generatedAt: new Date().toISOString(),
    y: 18 + 4,
  };
}

function newPage(ctx: ReportContext) {
  ctx.pdf.addPage();
  ctx.y = ctx.margin + 4;
  addPageFooter(ctx);
}

function addPageFooter(ctx: ReportContext) {
  const { pdf, pageW, pageH, margin, opts, reportId } = ctx;
  const pageNum = (pdf.internal as any).pages.length - 1;
  pdf.setFillColor(...C.navy);
  pdf.rect(0, pageH - 12, pageW, 12, 'F');
  pdf.setFontSize(7);
  pdf.setTextColor(...C.muted);
  pdf.text(`WebSentinel Security Assessment  ·  ${opts.targetDomain}`, margin, pageH - 4.5);
  pdf.text(`${opts.reportClassification}  ·  ${reportId}`, pageW / 2, pageH - 4.5, { align: 'center' });
  pdf.text(`Page ${pageNum}`, pageW - margin, pageH - 4.5, { align: 'right' });
  pdf.setTextColor(...C.pageText);
}

function sectionHeading(ctx: ReportContext, title: string, subtitle?: string): number {
  const { pdf, margin, contentW } = ctx;
  const pageNum = (pdf.internal as any).pages.length - 1;
  ctx.toc.push({ title, page: pageNum });

  pdf.setFillColor(...C.navy);
  pdf.rect(margin, pdf_getY(ctx), contentW, 10, 'F');
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.white);
  pdf.text(title, margin + 5, pdf_getY(ctx) + 7);
  pdf.setFillColor(...C.blue);
  pdf.rect(margin, pdf_getY(ctx), 3, 10, 'F');
  pdf_setY(ctx, pdf_getY(ctx) + 14);

  if (subtitle) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.pageMuted);
    pdf.text(subtitle, margin, pdf_getY(ctx));
    pdf_setY(ctx, pdf_getY(ctx) + 7);
  }
  pdf.setTextColor(...C.pageText);
  return pageNum;
}

function subHeading(ctx: ReportContext, title: string) {
  const { pdf, margin } = ctx;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.blue);
  pdf.text(title, margin, pdf_getY(ctx));
  pdf.setDrawColor(...C.blue);
  pdf.setLineWidth(0.4);
  pdf.line(margin, pdf_getY(ctx) + 1.5, margin + pdf.getTextWidth(title), pdf_getY(ctx) + 1.5);
  pdf_setY(ctx, pdf_getY(ctx) + 7);
  pdf.setTextColor(...C.pageText);
  pdf.setFont('helvetica', 'normal');
}

function bodyText(ctx: ReportContext, text: string, indent = 0) {
  const { pdf, margin, contentW } = ctx;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.pageText);
  const lines = pdf.splitTextToSize(text, contentW - indent);
  pdf.text(lines, margin + indent, pdf_getY(ctx));
  pdf_setY(ctx, pdf_getY(ctx) + lines.length * 5 + 2);
}

function keyValueRow(ctx: ReportContext, key: string, value: string, y?: number) {
  const { pdf, margin } = ctx;
  const rowY = y ?? pdf_getY(ctx);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.pageMuted);
  pdf.text(key, margin, rowY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.pageText);
  pdf.text(value, margin + 48, rowY);
  if (y === undefined) pdf_setY(ctx, rowY + 6);
}

function severityBadge(ctx: ReportContext, sev: string, x: number, y: number) {
  const { pdf } = ctx;
  const colors: Record<string, [number,number,number]> = {
    critical: C.critical, high: C.high, medium: C.medium,
    low: C.low, info: C.info, Critical: C.critical, High: C.high,
    Medium: C.medium, Low: C.low, Info: C.info,
  };
  const col = colors[sev] ?? C.info;
  pdf.setFillColor(col[0], col[1], col[2]);
  pdf.roundedRect(x, y - 3.5, 20, 5.5, 1.5, 1.5, 'F');
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(sev.toUpperCase().slice(0, 8), x + 10, y + 0.2, { align: 'center' });
  pdf.setTextColor(...C.pageText);
  pdf.setFont('helvetica', 'normal');
}

function checkY(ctx: ReportContext, needed = 30) {
  if (pdf_getY(ctx) > ctx.pageH - needed - 14) {
    newPage(ctx);
    pdf_setY(ctx, ctx.margin + 4);
  }
}

function pdf_getY(ctx: ReportContext): number { return ctx.y; }
function pdf_setY(ctx: ReportContext, y: number) { ctx.y = y; }

function statBox(ctx: ReportContext, x: number, y: number, w: number, h: number, label: string, value: string, color: [number,number,number]) {
  const { pdf } = ctx;
  pdf.setFillColor(...C.pageBg);
  pdf.setDrawColor(...C.pageBorder);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(x, y, w, h, 2, 2, 'FD');
  pdf.setFillColor(...color);
  pdf.rect(x, y, 2.5, h, 'F');
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...color);
  pdf.text(value, x + w / 2, y + h / 2 + 1, { align: 'center' });
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.pageMuted);
  pdf.text(label, x + w / 2, y + h - 4, { align: 'center' });
  pdf.setTextColor(...C.pageText);
}

function horizBar(ctx: ReportContext, x: number, y: number, w: number, pct: number, color: [number,number,number]) {
  const { pdf } = ctx;
  pdf.setFillColor(...C.pageBorder);
  pdf.roundedRect(x, y, w, 4, 1, 1, 'F');
  if (pct > 0) {
    pdf.setFillColor(...color);
    pdf.roundedRect(x, y, Math.max(2, w * pct), 4, 1, 1, 'F');
  }
}

// ── Section 0 — Cover page ─────────────────────────────────────────────────────

function buildCoverPage(ctx: ReportContext) {
  const { pdf, pageW, pageH, opts, reportId, generatedAt } = ctx;

  // Background
  pdf.setFillColor(...C.navy);
  pdf.rect(0, 0, pageW, pageH, 'F');

  // Top accent bar
  pdf.setFillColor(...C.blue);
  pdf.rect(0, 0, pageW, 2.5, 'F');

  // Left stripe
  pdf.setFillColor(...C.navyMid);
  pdf.rect(0, 0, 8, pageH, 'F');

  // Logo area
  pdf.setFillColor(...C.navyLight);
  pdf.roundedRect(18, 20, 42, 14, 3, 3, 'F');
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.blue);
  pdf.text('web', 24, 29.5);
  pdf.setTextColor(...C.white);
  pdf.text('sentinel', 37.5, 29.5);

  // Main title
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.white);
  pdf.text('Security Assessment', 18, 75);
  pdf.text('Report', 18, 90);

  // Blue underline
  pdf.setFillColor(...C.blue);
  pdf.rect(18, 95, 60, 1.2, 'F');

  // Target
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.blueLight);
  pdf.text(opts.targetDomain || 'Target Domain', 18, 108);

  // Meta block
  const metaY = 135;
  const metaRows: [string, string][] = [
    ['Report ID',         reportId],
    ['Classification',    opts.reportClassification],
    ['Organization',      opts.organizationName],
    ['Assessor',          opts.assessorName],
    ['Generated',         new Date(generatedAt).toUTCString()],
    ['Scan period',       ctx.scans.length > 0
      ? `${new Date(ctx.scans[ctx.scans.length - 1].scannedAt).toLocaleDateString()} – ${new Date(ctx.scans[0].scannedAt).toLocaleDateString()}`
      : 'N/A'],
  ];
  metaRows.forEach(([k, v], i) => {
    const rowY = metaY + i * 10;
    pdf.setDrawColor(...C.navyLight);
    pdf.setLineWidth(0.2);
    pdf.line(18, rowY - 1, pageW - 18, rowY - 1);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.muted);
    pdf.text(k.toUpperCase(), 18, rowY + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.white);
    pdf.text(v, 70, rowY + 5);
  });

  // Classification banner
  const clrMap: Record<string, [number,number,number]> = {
    Confidential: C.critical, Internal: C.amber, Public: C.green,
  };
  const clrCol = clrMap[opts.reportClassification] ?? C.blue;
  pdf.setFillColor(...clrCol);
  pdf.rect(0, pageH - 18, pageW, 18, 'F');
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(`⚠  ${opts.reportClassification.toUpperCase()} — Handle in accordance with information security policy`, pageW / 2, pageH - 7, { align: 'center' });

  addPageFooter(ctx);
}

// ── TOC ────────────────────────────────────────────────────────────────────────

function buildTOC(ctx: ReportContext) {
  const { pdf, margin, pageW, contentW } = ctx;
  newPage(ctx);
  pdf_setY(ctx, margin + 4);

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.pageText);
  pdf.text('Table of Contents', margin, pdf_getY(ctx));
  pdf_setY(ctx, pdf_getY(ctx) + 14);

  ctx.toc.forEach((entry, i) => {
    checkY(ctx, 10);
    const y = pdf_getY(ctx);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    pdf.setTextColor(...C.pageText);
    pdf.text(`${i + 1}.  ${entry.title}`, margin + 4, y);
    pdf.setTextColor(...C.blue);
    pdf.text(String(entry.page), pageW - margin, y, { align: 'right' });
    // dot leader
    pdf.setDrawColor(...C.pageBorder);
    pdf.setLineWidth(0.2);
    const textEnd = margin + 4 + pdf.getTextWidth(`${i + 1}.  ${entry.title}`) + 2;
    const numStart = pageW - margin - pdf.getTextWidth(String(entry.page)) - 2;
    for (let dx = textEnd; dx < numStart; dx += 3) {
      pdf.circle(dx, y - 1, 0.3, 'F');
    }
    pdf_setY(ctx, y + 7);
  });
}

// ── Section 1 — Executive Summary ─────────────────────────────────────────────

function buildExecutiveSummary(ctx: ReportContext) {
  const { pdf, margin, contentW, subScans, tlsScans, allFindings, latestTls, latestSub, opts } = ctx;
  newPage(ctx);
  pdf_setY(ctx, margin + 4);
  sectionHeading(ctx, '1. Executive Summary', 'High-level assessment posture and key findings overview');

  // Overall posture
  const score   = latestTls ? scoreFromTlsScan(latestTls) : null;
  const grade   = latestTls?.grade ?? 'N/A';
  const totalSub = subScans.reduce((n, s) => n + s.data.totalFound, 0);
  const resolvedSub = subScans.reduce((n, s) => n + s.data.resolvedCount, 0);
  const httpsCount  = subScans.reduce((n, s) => n + s.data.subdomains.filter(d => d.httpsAvailable).length, 0);
  const critCount   = allFindings.filter(f => f.severity === 'Critical').length;
  const highCount   = allFindings.filter(f => f.severity === 'High').length;
  const medCount    = allFindings.filter(f => f.severity === 'Medium').length;
  const lowCount    = allFindings.filter(f => f.severity === 'Low').length;

  // Stat boxes row 1
  const bw = (contentW - 12) / 4;
  const bh = 26;
  const bx = margin;
  const by = pdf_getY(ctx);
  statBox(ctx, bx,          by, bw, bh, 'TLS Score',       score != null ? `${score}/100` : 'N/A',  C.blue);
  statBox(ctx, bx+bw+4,     by, bw, bh, 'TLS Grade',       grade,                                   score != null && score >= 80 ? C.greenDark : score != null && score >= 50 ? C.amber : C.critical);
  statBox(ctx, bx+bw*2+8,   by, bw, bh, 'Subdomains Found',String(totalSub),                        C.blue);
  statBox(ctx, bx+bw*3+12,  by, bw, bh, 'Total Findings',  String(allFindings.length),             allFindings.length === 0 ? C.greenDark : critCount > 0 ? C.critical : highCount > 0 ? C.amber : C.blue);
  pdf_setY(ctx, by + bh + 5);

  // Stat boxes row 2
  const by2 = pdf_getY(ctx);
  statBox(ctx, bx,          by2, bw, bh, 'Resolved Hosts', String(resolvedSub),     C.greenDark);
  statBox(ctx, bx+bw+4,     by2, bw, bh, 'HTTPS Enabled',  String(httpsCount),      C.green);
  statBox(ctx, bx+bw*2+8,   by2, bw, bh, 'Critical Issues', String(critCount),      critCount > 0 ? C.critical : C.greenDark);
  statBox(ctx, bx+bw*3+12,  by2, bw, bh, 'High Issues',    String(highCount),       highCount > 0 ? C.high : C.greenDark);
  pdf_setY(ctx, by2 + bh + 10);

  // Assessment scope
  subHeading(ctx, 'Assessment Scope');
  keyValueRow(ctx, 'Primary Target',    opts.targetDomain || ctx.scans[0]?.domain || 'N/A');
  keyValueRow(ctx, 'Scans Performed',   `${ctx.scans.length} total (${subScans.length} subdomain, ${tlsScans.length} TLS)`);
  keyValueRow(ctx, 'Assessment Period', ctx.scans.length > 0
    ? `${new Date(ctx.scans[ctx.scans.length - 1].scannedAt).toLocaleString()} – ${new Date(ctx.scans[0].scannedAt).toLocaleString()}`
    : 'N/A');
  keyValueRow(ctx, 'Domains Assessed',  [...new Set(ctx.scans.map(s => s.domain))].join(', ') || 'N/A');
  keyValueRow(ctx, 'Report Generated',  new Date().toLocaleString());
  pdf_setY(ctx, pdf_getY(ctx) + 4);

  // Key findings summary
  subHeading(ctx, 'Key Findings Summary');
  const sevData = [
    { label: 'Critical', count: critCount, color: C.critical },
    { label: 'High',     count: highCount, color: C.high },
    { label: 'Medium',   count: medCount,  color: C.medium },
    { label: 'Low',      count: lowCount,  color: C.low },
    { label: 'Info',     count: allFindings.filter(f => f.severity === 'Info').length, color: C.info },
  ];
  const maxCount = Math.max(...sevData.map(s => s.count), 1);
  const barW = contentW * 0.55;
  sevData.forEach(s => {
    checkY(ctx, 12);
    const y = pdf_getY(ctx);
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...s.color);
    pdf.text(s.label.padEnd(10), margin, y + 3.5);
    horizBar(ctx, margin + 28, y, barW, s.count / maxCount, s.color);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.pageMuted);
    pdf.text(String(s.count), margin + 28 + barW + 4, y + 3.5);
    pdf_setY(ctx, y + 8);
  });
  pdf_setY(ctx, pdf_getY(ctx) + 4);

  // Security posture narrative
  subHeading(ctx, 'Security Posture');
  const posture = buildPostureNarrative(ctx);
  bodyText(ctx, posture);

  // Assessment limitations
  checkY(ctx, 25);
  subHeading(ctx, 'Assessment Limitations');
  bodyText(ctx, [
    '• This assessment is based exclusively on passive/active enumeration data collected by WebSentinel at the time of scanning.',
    '• No authenticated testing, source-code review, or manual exploitation was performed.',
    '• DNS and TLS data reflects the state of the target at scan time and may change.',
    '• Certificate Transparency data is sourced from public CT logs and may not be exhaustive.',
    '• Absence of a finding does not imply absence of a vulnerability.',
  ].join('\n'));
}

function buildPostureNarrative(ctx: ReportContext): string {
  const { allFindings, latestTls, subScans } = ctx;
  const score = latestTls ? scoreFromTlsScan(latestTls) : null;
  const crit  = allFindings.filter(f => f.severity === 'Critical').length;
  const high  = allFindings.filter(f => f.severity === 'High').length;
  const totalSub = subScans.reduce((n, s) => n + s.data.totalFound, 0);

  if (!latestTls && subScans.length === 0) {
    return 'No scan data is available for this report. Run subdomain enumeration or TLS checks to populate the assessment.';
  }

  const parts: string[] = [];
  if (score != null) {
    if (score >= 90) parts.push(`The TLS/HTTPS configuration is strong (score: ${score}/100, grade: ${latestTls!.grade}), indicating modern protocol support and appropriate certificate management.`);
    else if (score >= 70) parts.push(`The TLS/HTTPS configuration is acceptable (score: ${score}/100, grade: ${latestTls!.grade}) but has several gaps that should be addressed.`);
    else if (score >= 50) parts.push(`The TLS/HTTPS configuration has material weaknesses (score: ${score}/100, grade: ${latestTls!.grade}) that expose users to potential downgrade and interception risks.`);
    else parts.push(`The TLS/HTTPS configuration is critically deficient (score: ${score}/100, grade: ${latestTls!.grade}). Immediate remediation is required.`);
  }
  if (totalSub > 0) {
    parts.push(`Subdomain enumeration identified ${totalSub} subdomains across all scans. A large attack surface increases the probability that at least one asset has a security gap.`);
  }
  if (crit > 0) {
    parts.push(`${crit} critical finding${crit > 1 ? 's were' : ' was'} identified. Critical findings represent immediate risk and should be prioritised for remediation within 24–48 hours.`);
  } else if (high > 0) {
    parts.push(`${high} high-severity finding${high > 1 ? 's were' : ' was'} identified. These should be remediated within 7 days.`);
  } else {
    parts.push('No critical or high-severity findings were identified in the current scan set.');
  }
  return parts.join(' ');
}

// ── Section 2 — Subdomain Enumeration ─────────────────────────────────────────

function buildSubdomainSection(ctx: ReportContext) {
  const { subScans, margin, contentW } = ctx;
  if (subScans.length === 0) {
    newPage(ctx);
    pdf_setY(ctx, ctx.margin + 4);
    sectionHeading(ctx, '2. Subdomain Enumeration', 'No subdomain scan data available');
    bodyText(ctx, 'No subdomain enumeration scans have been performed. Run a subdomain scan from the Subdomains page to populate this section.');
    return;
  }

  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);
  sectionHeading(ctx, '2. Subdomain Enumeration & Asset Inventory',
    `${subScans.length} enumeration scan(s) · ${subScans.reduce((n, s) => n + s.data.totalFound, 0)} total subdomains discovered`);

  // Aggregate all unique FQDNs across all subdomain scans
  const fqdnMap = new Map<string, SubdomainEntry>();
  for (const scan of subScans) {
    for (const sub of scan.data.subdomains) {
      if (!fqdnMap.has(sub.fqdn)) fqdnMap.set(sub.fqdn, sub);
    }
  }
  const allEntries = [...fqdnMap.values()];
  const resolved   = allEntries.filter(e => e.resolved);
  const unresolved = allEntries.filter(e => !e.resolved);
  const httpsOn    = allEntries.filter(e => e.httpsAvailable);
  const wildcard   = allEntries.filter(e => e.fqdn.startsWith('*.'));
  const withCnames = allEntries.filter(e => (e.cnames?.length ?? 0) > 0);

  // Per-scan summary table
  subHeading(ctx, 'Scan Summary');
  autoTable(ctx.pdf, {
    startY: pdf_getY(ctx),
    margin: { left: margin, right: margin },
    head: [['Scan ID', 'Domain', 'Mode', 'Found', 'Resolved', 'Sources', 'Elapsed', 'Date']],
    body: subScans.map(s => [
      s.id,
      s.data.domain,
      s.data.mode,
      String(s.data.totalFound),
      String(s.data.resolvedCount),
      String(s.data.sourceSummaries?.filter(src => src.ran && src.found > 0).length ?? '—'),
      elapsedLabel(s.elapsedMs),
      new Date(s.scannedAt).toLocaleDateString(),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.tableRow1 },
    theme: 'grid',
  });
  pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);

  // Asset statistics
  checkY(ctx, 35);
  subHeading(ctx, 'Asset Statistics');
  const bw = (contentW - 12) / 4;
  const bh = 22;
  const by = pdf_getY(ctx);
  statBox(ctx, margin,          by, bw, bh, 'Unique FQDNs',   String(allEntries.length), C.blue);
  statBox(ctx, margin+bw+4,     by, bw, bh, 'Resolved',        String(resolved.length),  C.greenDark);
  statBox(ctx, margin+bw*2+8,   by, bw, bh, 'HTTPS Enabled',   String(httpsOn.length),   C.green);
  statBox(ctx, margin+bw*3+12,  by, bw, bh, 'Unresolved',      String(unresolved.length),C.pageMuted);
  pdf_setY(ctx, by + bh + 8);

  // Source breakdown table
  const latestSrc = subScans[0]?.data.sourceSummaries;
  if (latestSrc && latestSrc.length > 0) {
    checkY(ctx, 40);
    subHeading(ctx, 'Discovery Source Breakdown (Latest Scan)');
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['Source', 'Type', 'Status', 'Subdomains Found', 'Elapsed', 'Notes']],
      body: latestSrc.map(src => [
        src.name,
        src.type,
        src.ran ? (src.error ? 'Error' : 'OK') : 'Not available',
        src.ran ? String(src.found) : '—',
        src.ran && src.elapsedMs > 0 ? elapsedLabel(src.elapsedMs) : '—',
        src.error ?? (src.ran ? '' : 'Binary not installed'),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: { 2: { cellWidth: 22 }, 3: { cellWidth: 28, halign: 'right' } },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 2) {
          const v = data.cell.raw as string;
          if (v === 'OK') data.cell.styles.textColor = C.greenDark;
          else if (v === 'Error') data.cell.styles.textColor = C.amber;
          else data.cell.styles.textColor = C.pageMuted;
        }
      },
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }

  // Subdomain classification
  checkY(ctx, 35);
  subHeading(ctx, 'Subdomain Classification');
  const classRows: [string, number, string][] = [
    ['Wildcard subdomains',          wildcard.length,   'Entries starting with *. — may expose broad attack surface'],
    ['Subdomains with CNAME records', withCnames.length, 'Potential subdomain takeover vectors if CNAME target is unclaimed'],
    ['Unresolved entries',            unresolved.length, 'DNS resolves with no IP — may indicate dangling DNS or decommissioned hosts'],
    ['HTTPS-enabled hosts',           httpsOn.length,    'Responded to HTTPS probing (only present when HTTP probe was enabled)'],
  ];
  autoTable(ctx.pdf, {
    startY: pdf_getY(ctx),
    margin: { left: margin, right: margin },
    head: [['Classification', 'Count', 'Security Implication']],
    body: classRows,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
    columnStyles: { 1: { cellWidth: 18, halign: 'right' } },
    alternateRowStyles: { fillColor: C.tableRow1 },
    theme: 'grid',
  });
  pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);

  // Full asset inventory (first 200 entries)
  checkY(ctx, 40);
  subHeading(ctx, `Complete Asset Inventory (${Math.min(allEntries.length, 200)} of ${allEntries.length})`);
  const invBody = allEntries.slice(0, 200).map(e => [
    e.fqdn,
    e.resolved ? 'Yes' : 'No',
    e.ipAddresses.slice(0, 2).join(', ') || '—',
    (e.cnames ?? []).slice(0, 1).join('') || '—',
    e.httpsAvailable != null ? (e.httpsAvailable ? 'Yes' : 'No') : '—',
    e.httpStatus != null ? String(e.httpStatus) : '—',
    e.source,
  ]);
  autoTable(ctx.pdf, {
    startY: pdf_getY(ctx),
    margin: { left: margin, right: margin },
    head: [['FQDN', 'Resolved', 'IP Address(es)', 'CNAME', 'HTTPS', 'HTTP Status', 'Primary Source']],
    body: invBody,
    styles: { fontSize: 7, cellPadding: 2.5, overflow: 'ellipsize' },
    headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 55 }, 1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 34 }, 3: { cellWidth: 32 },
      4: { cellWidth: 14, halign: 'center' }, 5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 28 },
    },
    alternateRowStyles: { fillColor: C.tableRow1 },
    theme: 'grid',
    didParseCell: (data: any) => {
      if (data.section === 'body') {
        if (data.column.index === 1) {
          data.cell.styles.textColor = data.cell.raw === 'Yes' ? C.greenDark : C.critical;
        }
        if (data.column.index === 4) {
          data.cell.styles.textColor = data.cell.raw === 'Yes' ? C.greenDark : data.cell.raw === 'No' ? C.amber : C.pageMuted;
        }
      }
    },
  });
  pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 4);
  if (allEntries.length > 200) {
    ctx.pdf.setFontSize(7.5);
    ctx.pdf.setTextColor(...C.pageMuted);
    ctx.pdf.text(`Showing first 200 of ${allEntries.length} entries. Full inventory available in Appendix.`, margin, pdf_getY(ctx));
    pdf_setY(ctx, pdf_getY(ctx) + 6);
  }
}

// ── Section 3 — Certificate Transparency ──────────────────────────────────────

function buildCertTransparencySection(ctx: ReportContext) {
  const { subScans, margin } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);

  // Gather all CT-sourced entries
  const ctEntries = subScans.flatMap(s =>
    s.data.subdomains.filter(e =>
      e.source === 'crt.sh' || e.source === 'cert-transparency' ||
      (e.sources ?? []).some(src => src === 'crt.sh' || src === 'cert-transparency'),
    ),
  );
  const unique = [...new Map(ctEntries.map(e => [e.fqdn, e])).values()];
  const wildcards = unique.filter(e => e.fqdn.startsWith('*.'));

  sectionHeading(ctx, '3. Certificate Transparency Analysis',
    `${unique.length} unique hostnames discovered via CT logs`);

  subHeading(ctx, 'Overview');
  keyValueRow(ctx, 'CT Hostnames Found',      String(unique.length));
  keyValueRow(ctx, 'Wildcard Entries',         String(wildcards.length));
  keyValueRow(ctx, 'CT Source',               'crt.sh — public Certificate Transparency log aggregator');
  keyValueRow(ctx, 'Resolved of CT entries',  String(unique.filter(e => e.resolved).length));
  pdf_setY(ctx, pdf_getY(ctx) + 5);

  bodyText(ctx, 'Certificate Transparency logs record every publicly trusted TLS certificate issued. By querying CT logs, WebSentinel discovers subdomains that may not appear in DNS zone transfers or brute-force scans. Wildcard certificates are flagged as they may expose broad attack surfaces.');
  pdf_setY(ctx, pdf_getY(ctx) + 4);

  if (unique.length > 0) {
    checkY(ctx, 40);
    subHeading(ctx, 'CT-Sourced Hostname Inventory');
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['FQDN', 'Wildcard', 'Resolved', 'IP Addresses', 'HTTPS', 'CNAME']],
      body: unique.slice(0, 150).map(e => [
        e.fqdn,
        e.fqdn.startsWith('*.') ? 'Yes' : 'No',
        e.resolved ? 'Yes' : 'No',
        e.ipAddresses.slice(0, 2).join(', ') || '—',
        e.httpsAvailable != null ? (e.httpsAvailable ? 'Yes' : 'No') : '—',
        (e.cnames ?? []).slice(0, 1).join('') || '—',
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: {
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 14, halign: 'center' },
      },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
      didParseCell: (data: any) => {
        if (data.section === 'body') {
          if (data.column.index === 1 && data.cell.raw === 'Yes') data.cell.styles.textColor = C.amber;
          if (data.column.index === 2) data.cell.styles.textColor = data.cell.raw === 'Yes' ? C.greenDark : C.critical;
          if (data.column.index === 4) data.cell.styles.textColor = data.cell.raw === 'Yes' ? C.greenDark : data.cell.raw === 'No' ? C.amber : C.pageMuted;
        }
      },
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  } else {
    bodyText(ctx, 'No subdomains were attributed to Certificate Transparency sources in the current scans. This may indicate that no crt.sh query was run, or that the domain has no publicly logged certificates.');
  }

  // Wildcard analysis
  if (wildcards.length > 0) {
    checkY(ctx, 30);
    subHeading(ctx, 'Wildcard Certificate Entries');
    bodyText(ctx, 'Wildcard entries (*.example.com) in CT logs indicate the issuance of wildcard certificates. These certificates apply to all first-level subdomains and, if compromised, expose every subdomain simultaneously. Review the issuing CA and ensure wildcard usage is intentional and justified.');
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['Wildcard FQDN', 'Resolved', 'Source']],
      body: wildcards.map(e => [e.fqdn, e.resolved ? 'Yes' : 'No', e.source]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [180, 80, 30], textColor: [255,255,255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }
}

// ── Section 4 — DNS Analysis ───────────────────────────────────────────────────

function buildDNSSection(ctx: ReportContext) {
  const { subScans, margin } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);

  const allSubs = subScans.flatMap(s => s.data.subdomains);
  const uniqueSubs = [...new Map(allSubs.map(e => [e.fqdn, e])).values()];
  const resolved   = uniqueSubs.filter(e => e.resolved);
  const cnamed     = uniqueSubs.filter(e => (e.cnames?.length ?? 0) > 0);
  const ipSet      = new Map<string, string[]>();
  for (const e of resolved) {
    for (const ip of e.ipAddresses) {
      const existing = ipSet.get(ip) ?? [];
      existing.push(e.fqdn);
      ipSet.set(ip, existing);
    }
  }
  const sharedIPs = [...ipSet.entries()].filter(([, fqdns]) => fqdns.length > 1);

  sectionHeading(ctx, '4. DNS Analysis',
    `${resolved.length} resolved hosts · ${cnamed.length} CNAME records · ${ipSet.size} unique IPs`);

  subHeading(ctx, 'DNS Resolution Statistics');
  keyValueRow(ctx, 'Total Unique FQDNs',     String(uniqueSubs.length));
  keyValueRow(ctx, 'Successfully Resolved',  String(resolved.length));
  keyValueRow(ctx, 'Unresolved / Dead',      String(uniqueSubs.length - resolved.length));
  keyValueRow(ctx, 'CNAME Records',          String(cnamed.length));
  keyValueRow(ctx, 'Unique IP Addresses',    String(ipSet.size));
  keyValueRow(ctx, 'Shared IPs (>1 FQDN)',   String(sharedIPs.length));
  pdf_setY(ctx, pdf_getY(ctx) + 5);

  // IP to hostname mapping
  if (ipSet.size > 0) {
    checkY(ctx, 40);
    subHeading(ctx, 'IP Address to Hostname Mapping (Top 100)');
    const ipRows = [...ipSet.entries()].slice(0, 100).map(([ip, fqdns]) => [
      ip,
      String(fqdns.length),
      fqdns.slice(0, 3).join(', ') + (fqdns.length > 3 ? ` +${fqdns.length - 3} more` : ''),
    ]);
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['IP Address', 'Hostnames', 'FQDN Sample']],
      body: ipRows,
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 22, halign: 'right' } },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }

  // CNAME records — potential takeover candidates
  if (cnamed.length > 0) {
    checkY(ctx, 40);
    subHeading(ctx, 'CNAME Records');
    bodyText(ctx, 'CNAME records that point to external services (e.g. Heroku, GitHub Pages, Fastly, Shopify) may be susceptible to subdomain takeover if the target service account is deleted but the DNS record is not removed. Review the CNAME targets below and verify each is still actively provisioned.');
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['FQDN', 'CNAME Target(s)', 'Resolved', 'Risk Note']],
      body: cnamed.slice(0, 100).map(e => {
        const targets = e.cnames ?? [];
        const risk = targets.some(t => /heroku|github\.io|fastly|shopify|amazonaws|cloudfront|azurewebsites|zendesk|wpengine/i.test(t))
          ? 'Potential takeover risk — verify target is active'
          : '';
        return [e.fqdn, targets.join(', '), e.resolved ? 'Yes' : 'No', risk];
      }),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: { 2: { cellWidth: 18, halign: 'center' } },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3 && data.cell.raw !== '') {
          data.cell.styles.textColor = C.amber;
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.section === 'body' && data.column.index === 2) {
          data.cell.styles.textColor = data.cell.raw === 'Yes' ? C.greenDark : C.critical;
        }
      },
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }

  // Unresolved entries
  const unresolved = uniqueSubs.filter(e => !e.resolved);
  if (unresolved.length > 0) {
    checkY(ctx, 30);
    subHeading(ctx, 'Unresolved / Potentially Dangling DNS Entries');
    bodyText(ctx, 'Entries found in Certificate Transparency logs or passive sources but that do not currently resolve may indicate historical subdomains, decommissioned services, or misconfigured DNS. Stale DNS records without live endpoints ("dangling DNS") can sometimes be hijacked.');
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['FQDN', 'Discovery Source', 'Last Seen In Scan']],
      body: unresolved.slice(0, 80).map(e => [
        e.fqdn,
        e.source,
        subScans.find(s => s.data.subdomains.some(d => d.fqdn === e.fqdn))
          ? new Date(subScans.find(s => s.data.subdomains.some(d => d.fqdn === e.fqdn))!.scannedAt).toLocaleDateString()
          : '—',
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: [100, 60, 20], textColor: [255,255,255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }
}

// ── Section 5 — HTTPS / TLS Assessment ────────────────────────────────────────

function buildTLSSection(ctx: ReportContext) {
  const { tlsScans, margin } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);

  sectionHeading(ctx, '5. HTTPS / TLS Assessment',
    `${tlsScans.length} TLS scan(s) performed`);

  if (tlsScans.length === 0) {
    bodyText(ctx, 'No TLS scans have been performed. Run a TLS check from the TLS & Certificate Check page to populate this section.');
    return;
  }

  for (const scan of tlsScans) {
    checkY(ctx, 60);
    const d = scan.data;
    const cert = d.cert;
    const score = scoreFromTlsScan(scan);

    subHeading(ctx, `Host: ${d.host}${d.port !== 443 ? ':' + d.port : ''}`);
    keyValueRow(ctx, 'Scan Time',    new Date(d.scanTime).toLocaleString());
    keyValueRow(ctx, 'Overall Grade', d.overallGrade);
    keyValueRow(ctx, 'Score',        `${score} / 100`);
    keyValueRow(ctx, 'Elapsed',      elapsedLabel(d.elapsedMs));
    keyValueRow(ctx, 'HTTPS',        d.httpsRedirect.httpsAvailable ? 'Available' : 'Not available');
    keyValueRow(ctx, 'HTTP→HTTPS',   d.httpsRedirect.redirectsToHttps ? 'Yes (redirects)' : (d.httpsRedirect.httpAvailable ? 'No (HTTP open, no redirect)' : 'HTTP not available'));
    pdf_setY(ctx, pdf_getY(ctx) + 4);

    // TLS version support
    checkY(ctx, 28);
    const tlsRows: string[][] = [
      ['TLS 1.0', d.tlsSupport.tls10 ? 'ENABLED' : 'Disabled', d.tlsSupport.tls10 ? 'Deprecated — RFC 8996. Disable immediately.' : 'Correct — disabled'],
      ['TLS 1.1', d.tlsSupport.tls11 ? 'ENABLED' : 'Disabled', d.tlsSupport.tls11 ? 'Deprecated. Disable and support only TLS 1.2+.' : 'Correct — disabled'],
      ['TLS 1.2', d.tlsSupport.tls12 ? 'Supported' : 'Not supported', d.tlsSupport.tls12 ? 'Good — modern, acceptable.' : 'Warning — most clients require TLS 1.2+.'],
      ['TLS 1.3', d.tlsSupport.tls13 ? 'Supported' : 'Not supported', d.tlsSupport.tls13 ? 'Excellent — recommended.' : 'Consider enabling TLS 1.3 for best performance and security.'],
    ];
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['TLS Version', 'Status', 'Assessment']],
      body: tlsRows,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: { 1: { cellWidth: 28 } },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1) {
          const v = data.cell.raw as string;
          if (v === 'ENABLED') data.cell.styles.textColor = C.critical;
          else if (v === 'Supported') data.cell.styles.textColor = C.greenDark;
          else if (v === 'Not supported' && (data.row.index === 2 || data.row.index === 3)) data.cell.styles.textColor = C.amber;
          else data.cell.styles.textColor = C.pageMuted;
        }
      },
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 6);

    // Certificate details
    if (cert) {
      checkY(ctx, 60);
      subHeading(ctx, 'Certificate Details');
      const certRows: [string, string][] = [
        ['Subject CN',          cert.subject?.CN ?? '—'],
        ['Subject O',           cert.subject?.O ?? '—'],
        ['Issuer CN',           cert.issuer?.CN ?? '—'],
        ['Issuer O',            cert.issuer?.O ?? '—'],
        ['Serial Number',       cert.serialNumber || '—'],
        ['Valid From',          new Date(cert.validFrom).toUTCString()],
        ['Valid To',            new Date(cert.validTo).toUTCString()],
        ['Days Until Expiry',   cert.isExpired ? 'EXPIRED' : String(cert.daysUntilExpiry)],
        ['Signature Algorithm', cert.signatureAlgorithm || '—'],
        ['Key Size',            cert.keyBits ? `${cert.keyBits} bits` : '—'],
        ['TLS Version',         cert.tlsVersion],
        ['Cipher Suite',        cert.cipherSuite],
        ['Wildcard',            cert.isWildcard ? 'Yes' : 'No'],
        ['Self-signed',         cert.isSelfSigned ? 'Yes (NOT trusted)' : 'No'],
        ['SAN Count',           String(cert.sanCount)],
        ['SHA-1 Fingerprint',   cert.fingerprint || '—'],
        ['SHA-256 Fingerprint', cert.fingerprint256 || '—'],
      ];
      autoTable(ctx.pdf, {
        startY: pdf_getY(ctx),
        margin: { left: margin, right: margin },
        head: [['Field', 'Value']],
        body: certRows,
        styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold', textColor: C.pageMuted } },
        alternateRowStyles: { fillColor: C.tableRow1 },
        theme: 'grid',
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 1) {
            const v = data.cell.raw as string;
            if (v === 'EXPIRED' || v === 'Yes (NOT trusted)') data.cell.styles.textColor = C.critical;
            if (v === 'Yes' && data.row.index === certRows.findIndex(r => r[0] === 'Wildcard')) data.cell.styles.textColor = C.amber;
          }
        },
      });
      pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 4);

      // SANs
      if (cert.subjectAltNames.length > 0) {
        checkY(ctx, 25);
        ctx.pdf.setFontSize(8);
        ctx.pdf.setFont('helvetica', 'normal');
        ctx.pdf.setTextColor(...C.pageMuted);
        ctx.pdf.text(`Subject Alternative Names (${cert.subjectAltNames.length}): ` +
          cert.subjectAltNames.slice(0, 30).join(', ') +
          (cert.subjectAltNames.length > 30 ? ` … (+${cert.subjectAltNames.length - 30} more)` : ''),
          margin, pdf_getY(ctx), { maxWidth: ctx.contentW });
        pdf_setY(ctx, pdf_getY(ctx) + 10);
      }
    }

    // HSTS details
    checkY(ctx, 22);
    const hsts = d.httpsRedirect;
    subHeading(ctx, 'HSTS Configuration');
    keyValueRow(ctx, 'HSTS Present',          hsts.hstsPresent ? 'Yes' : 'No (MISSING)');
    if (hsts.hstsPresent) {
      keyValueRow(ctx, 'max-age',              hsts.hstsMaxAge != null ? `${hsts.hstsMaxAge}s (${(hsts.hstsMaxAge / 86400).toFixed(0)} days)` : 'Not parsed');
      keyValueRow(ctx, 'includeSubDomains',    hsts.hstsIncludeSubdomains ? 'Yes' : 'No');
      keyValueRow(ctx, 'preload',              hsts.hstsPreload ? 'Yes' : 'No');
    }
    pdf_setY(ctx, pdf_getY(ctx) + 6);
  }
}

// ── Section 6 — Security Headers ──────────────────────────────────────────────

function buildSecurityHeadersSection(ctx: ReportContext) {
  const { tlsScans, margin } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);
  sectionHeading(ctx, '6. Security Headers Analysis', 'HTTP response header security review');

  if (tlsScans.length === 0) {
    bodyText(ctx, 'No TLS scans available. Security headers are assessed as part of the TLS check.');
    return;
  }

  const recommendations: Record<string, string> = {
    'strict-transport-security':  'Set max-age ≥ 31536000 with includeSubDomains and preload.',
    'content-security-policy':     "Define a strict policy. Start with default-src 'self' and add exceptions only as needed.",
    'x-content-type-options':      "Set to 'nosniff' unconditionally.",
    'x-frame-options':             "Set to 'DENY' unless embedding in iframes is explicitly required.",
    'referrer-policy':             "Use 'strict-origin-when-cross-origin' or stricter.",
    'permissions-policy':          'Restrict camera, microphone, geolocation and other sensitive APIs.',
    'x-xss-protection':            "Legacy header. Set to '0' and rely on CSP instead.",
    'cache-control':               "For authenticated pages: 'no-store, no-cache, must-revalidate'.",
  };

  for (const scan of tlsScans) {
    checkY(ctx, 40);
    subHeading(ctx, `Host: ${scan.data.host}`);

    const headers: SecurityHeaderInfo[] = scan.data.securityHeaders;
    const present = headers.filter(h => h.present);
    const missing = headers.filter(h => !h.present);
    const highMissing = missing.filter(h => h.severity === 'high' || h.severity === 'critical');

    keyValueRow(ctx, 'Headers Present', `${present.length} / ${headers.length}`);
    keyValueRow(ctx, 'Missing (High/Critical)', String(highMissing.length));
    pdf_setY(ctx, pdf_getY(ctx) + 4);

    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['Header', 'Status', 'Severity', 'Value / Recommendation']],
      body: headers.map(h => [
        h.header,
        h.present ? 'Present' : 'MISSING',
        h.severity.toUpperCase(),
        h.present ? (h.value ?? '(set, value not captured)') : (recommendations[h.header] ?? h.recommendation),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 48, fontStyle: 'italic' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
      },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
      didParseCell: (data: any) => {
        if (data.section === 'body') {
          if (data.column.index === 1) {
            data.cell.styles.textColor = data.cell.raw === 'Present' ? C.greenDark : C.critical;
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 2) {
            const s = (data.cell.raw as string).toLowerCase();
            if (s === 'critical') data.cell.styles.textColor = C.critical;
            else if (s === 'high') data.cell.styles.textColor = C.high;
            else if (s === 'medium') data.cell.styles.textColor = C.medium;
            else if (s === 'low') data.cell.styles.textColor = C.low;
            else data.cell.styles.textColor = C.info;
          }
        }
      },
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }
}

// ── Section 7 — Findings ───────────────────────────────────────────────────────

function buildFindingsSection(ctx: ReportContext) {
  const { allFindings, margin, contentW } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);

  const sevOrder = ['Critical', 'High', 'Medium', 'Low', 'Info'] as const;
  const grouped = sevOrder.reduce((acc, sev) => {
    acc[sev] = allFindings.filter(f => f.severity === sev);
    return acc;
  }, {} as Record<string, Finding[]>);

  sectionHeading(ctx, '7. Security Findings',
    `${allFindings.length} total findings across all scans`);

  // Summary table
  autoTable(ctx.pdf, {
    startY: pdf_getY(ctx),
    margin: { left: margin, right: margin },
    head: [['Severity', 'Count', 'SLA (Remediation Timeline)']],
    body: [
      ['Critical', String(grouped['Critical'].length), '24–48 hours'],
      ['High',     String(grouped['High'].length),     '7 days'],
      ['Medium',   String(grouped['Medium'].length),   '30 days'],
      ['Low',      String(grouped['Low'].length),      '90 days'],
      ['Info',     String(grouped['Info'].length),     'Best effort'],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 20 } },
    alternateRowStyles: { fillColor: C.tableRow1 },
    theme: 'grid',
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 0) {
        const s = data.cell.raw as string;
        const colMap: Record<string, [number,number,number]> = {
          Critical: C.critical, High: C.high, Medium: C.medium, Low: C.low, Info: C.info,
        };
        data.cell.styles.textColor = colMap[s] ?? C.pageText;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 10);

  // Detailed findings by severity
  for (const sev of sevOrder) {
    const findings = grouped[sev];
    if (findings.length === 0) continue;

    checkY(ctx, 30);
    const sevColors: Record<string, [number,number,number]> = {
      Critical: C.critical, High: C.high, Medium: C.medium, Low: C.low, Info: C.info,
    };
    const sevCol = sevColors[sev] ?? C.info;

    // Severity sub-header band
    ctx.pdf.setFillColor(...sevCol);
    ctx.pdf.setFillColor(sevCol[0], sevCol[1], sevCol[2], 0.08);
    ctx.pdf.setFillColor(...sevCol);
    ctx.pdf.rect(margin, pdf_getY(ctx), contentW, 8, 'F');
    ctx.pdf.setFontSize(10);
    ctx.pdf.setFont('helvetica', 'bold');
    ctx.pdf.setTextColor(255, 255, 255);
    ctx.pdf.text(`${sev.toUpperCase()}  (${findings.length} finding${findings.length !== 1 ? 's' : ''})`, margin + 4, pdf_getY(ctx) + 5.5);
    pdf_setY(ctx, pdf_getY(ctx) + 12);
    ctx.pdf.setFont('helvetica', 'normal');
    ctx.pdf.setTextColor(...C.pageText);

    findings.forEach((f, idx) => {
      checkY(ctx, 45);

      // Finding ID badge
      ctx.pdf.setFillColor(...C.pageBg);
      ctx.pdf.setDrawColor(...C.pageBorder);
      ctx.pdf.setLineWidth(0.3);
      ctx.pdf.roundedRect(margin, pdf_getY(ctx), contentW, 3.5, 0.5, 0.5, 'FD');
      ctx.pdf.setFontSize(7.5);
      ctx.pdf.setFont('helvetica', 'bold');
      ctx.pdf.setTextColor(...C.pageMuted);
      ctx.pdf.text(`Finding ${f.id}`, margin + 2, pdf_getY(ctx) + 2.5);
      ctx.pdf.setTextColor(...sevCol);
      ctx.pdf.text(sev.toUpperCase(), margin + contentW - 2, pdf_getY(ctx) + 2.5, { align: 'right' });
      pdf_setY(ctx, pdf_getY(ctx) + 6);

      // Title
      ctx.pdf.setFontSize(10);
      ctx.pdf.setFont('helvetica', 'bold');
      ctx.pdf.setTextColor(...C.pageText);
      ctx.pdf.text(f.title, margin + 2, pdf_getY(ctx));
      pdf_setY(ctx, pdf_getY(ctx) + 6);

      // Metadata
      ctx.pdf.setFontSize(8);
      ctx.pdf.setFont('helvetica', 'normal');
      ctx.pdf.setTextColor(...C.pageMuted);
      ctx.pdf.text(`Domain: ${f.domain}   ·   Category: ${f.category}   ·   Scan: ${f.scanId}   ·   Detected: ${new Date(f.scannedAt).toLocaleDateString()}`, margin + 2, pdf_getY(ctx));
      pdf_setY(ctx, pdf_getY(ctx) + 6);

      // Detail
      ctx.pdf.setFontSize(8.5);
      ctx.pdf.setFont('helvetica', 'normal');
      ctx.pdf.setTextColor(...C.pageText);
      const detailLines = ctx.pdf.splitTextToSize(f.detail, contentW - 4);
      ctx.pdf.text(detailLines, margin + 2, pdf_getY(ctx));
      pdf_setY(ctx, pdf_getY(ctx) + detailLines.length * 4.8 + 4);

      // Impact row
      const impactMap: Record<string, string> = {
        Critical: 'Immediate exploitation risk. Could lead to data breach, service compromise, or full system access.',
        High:     'Significant security weakness. Likely exploitable and may lead to serious data exposure or service disruption.',
        Medium:   'Moderate security concern. May be exploitable under specific conditions. Reduces overall security posture.',
        Low:      'Minor security gap. Limited exploitability. Address as part of routine hardening.',
        Info:     'Informational observation. No immediate risk. Useful for hardening and best-practice alignment.',
      };
      ctx.pdf.setFontSize(7.5);
      ctx.pdf.setFont('helvetica', 'bold');
      ctx.pdf.setTextColor(...C.pageMuted);
      ctx.pdf.text('POTENTIAL IMPACT:', margin + 2, pdf_getY(ctx));
      ctx.pdf.setFont('helvetica', 'normal');
      ctx.pdf.setTextColor(...C.pageText);
      const impactLines = ctx.pdf.splitTextToSize(impactMap[sev] ?? '', contentW - 40);
      ctx.pdf.text(impactLines, margin + 38, pdf_getY(ctx));
      pdf_setY(ctx, pdf_getY(ctx) + 8);

      // Divider
      if (idx < findings.length - 1) {
        ctx.pdf.setDrawColor(...C.pageBorder);
        ctx.pdf.setLineWidth(0.2);
        ctx.pdf.line(margin, pdf_getY(ctx) - 2, margin + contentW, pdf_getY(ctx) - 2);
      }
    });
    pdf_setY(ctx, pdf_getY(ctx) + 6);
  }
}

// ── Section 8 — Risk Assessment ────────────────────────────────────────────────

function buildRiskSection(ctx: ReportContext) {
  const { allFindings, latestTls, subScans, margin, contentW } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);
  sectionHeading(ctx, '8. Risk Assessment', 'Risk scoring methodology and classification');

  const score  = latestTls ? scoreFromTlsScan(latestTls) : null;
  const crit   = allFindings.filter(f => f.severity === 'Critical').length;
  const high   = allFindings.filter(f => f.severity === 'High').length;
  const med    = allFindings.filter(f => f.severity === 'Medium').length;
  const low    = allFindings.filter(f => f.severity === 'Low').length;

  // Scoring methodology
  subHeading(ctx, 'Scoring Methodology');
  bodyText(ctx, 'WebSentinel uses a composite risk score derived from TLS configuration quality, certificate validity, security header coverage, and findings severity. The TLS grade (A+ through F) maps to a base score; findings incur deductions based on severity.');
  pdf_setY(ctx, pdf_getY(ctx) + 3);

  autoTable(ctx.pdf, {
    startY: pdf_getY(ctx),
    margin: { left: margin, right: margin },
    head: [['Component', 'Base Contribution', 'Notes']],
    body: [
      ['TLS Grade A+ (score ≥ 95)',  '+97 base',     'Modern TLS, HSTS preload, all headers present'],
      ['TLS Grade A  (score ≥ 80)',  '+90 base',     'Strong configuration, minor gaps'],
      ['TLS Grade B  (score ≥ 65)',  '+75 base',     'Acceptable, several headers missing'],
      ['TLS Grade C  (score ≥ 50)',  '+60 base',     'Deprecated TLS versions or weak headers'],
      ['TLS Grade D  (score ≥ 35)',  '+40 base',     'Multiple significant issues'],
      ['TLS Grade F  (score < 35)',  '+15 base',     'Certificate invalid or expired'],
      ['Each Critical finding',      '−8 points',    'Cap: score cannot go below 0'],
      ['Each High finding',          '−4 points',    ''],
      ['Each Medium finding',        '−2 points',    ''],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.tableRow1 },
    theme: 'grid',
  });
  pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);

  // Current scores
  checkY(ctx, 35);
  subHeading(ctx, 'Current Risk Scores');
  autoTable(ctx.pdf, {
    startY: pdf_getY(ctx),
    margin: { left: margin, right: margin },
    head: [['Domain', 'TLS Grade', 'Score', 'Critical', 'High', 'Medium', 'Low', 'Risk Level']],
    body: ctx.tlsScans.map(s => {
      const sc = scoreFromTlsScan(s);
      const risk = sc >= 85 ? 'Low' : sc >= 65 ? 'Medium' : sc >= 40 ? 'High' : 'Critical';
      return [s.domain, s.grade, `${sc}/100`, s.findingsCount.critical, s.findingsCount.high, s.findingsCount.medium, s.findingsCount.low, risk];
    }),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
    alternateRowStyles: { fillColor: C.tableRow1 },
    theme: 'grid',
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 7) {
        const v = data.cell.raw as string;
        const colMap: Record<string, [number,number,number]> = { Critical: C.critical, High: C.high, Medium: C.amber, Low: C.greenDark };
        data.cell.styles.textColor = colMap[v] ?? C.pageText;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);

  // Category breakdown
  if (allFindings.length > 0) {
    checkY(ctx, 35);
    subHeading(ctx, 'Findings by Category');
    const cats = new Map<string, number>();
    for (const f of allFindings) cats.set(f.category, (cats.get(f.category) ?? 0) + 1);
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['Category', 'Count', 'Proportion']],
      body: [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([cat, n]) => [
        cat, n, `${((n / allFindings.length) * 100).toFixed(1)}%`,
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 20 }, 2: { halign: 'right', cellWidth: 24 } },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }
}

// ── Section 9 — Mitigation ────────────────────────────────────────────────────

function buildMitigationSection(ctx: ReportContext) {
  const { allFindings, margin } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);
  sectionHeading(ctx, '9. Risk Mitigation & Remediation', 'Prioritised, actionable remediation guidance');

  const REMEDIATION: Record<string, { steps: string; team: string; timeline: string; verify: string }> = {
    'TLS & transport': {
      steps: 'Disable TLS 1.0 and TLS 1.1 in server configuration. Ensure TLS 1.2 and TLS 1.3 are enabled. Configure cipher suites using modern cipher lists (e.g., Mozilla Intermediate or Modern).',
      team: 'Infrastructure / Platform', timeline: '7 days', verify: 'Re-run TLS check; confirm no TLS 1.0/1.1 response.',
    },
    'Certificate': {
      steps: 'Renew the certificate before expiry using your CA or a free provider (Let\'s Encrypt). For self-signed certs, replace with a publicly trusted certificate. Set up auto-renewal (certbot, ACME).',
      team: 'Infrastructure / DevOps', timeline: 'Immediate (< 48 hours if expired)', verify: 'Re-run TLS check; confirm cert is valid and daysUntilExpiry > 30.',
    },
    'Security headers': {
      steps: 'Add missing security headers to your web server or application. For nginx: add_header directives. For Apache: Header always set. For application frameworks: use a security middleware library.',
      team: 'Application / Platform', timeline: '14 days', verify: 'Re-run TLS check; confirm all headers present.',
    },
    'HTTPS enforcement': {
      steps: 'Configure HTTP (port 80) to return 301 redirects to HTTPS equivalents. Enable HSTS with max-age ≥ 31536000. Add includeSubDomains and preload after testing.',
      team: 'Infrastructure', timeline: '7 days', verify: 'Check HTTP response: expect 301 → https://. Check HSTS header.',
    },
    'Clickjacking': {
      steps: "Add 'X-Frame-Options: DENY' or 'X-Frame-Options: SAMEORIGIN' to all HTTP responses. Prefer frame-ancestors in CSP for modern browsers.",
      team: 'Application', timeline: '14 days', verify: 'Check response headers for X-Frame-Options or CSP frame-ancestors.',
    },
    'Information disclosure': {
      steps: "Set Referrer-Policy to 'no-referrer' or 'strict-origin-when-cross-origin'. Remove or sanitise Server and X-Powered-By response headers.",
      team: 'Application / Infrastructure', timeline: '30 days', verify: 'Check headers: Referrer-Policy present, Server header generic.',
    },
  };

  const categories = [...new Set(allFindings.map(f => f.category))];
  const sevOrder = ['Critical', 'High', 'Medium', 'Low'] as const;

  for (const sev of sevOrder) {
    const sevFindings = allFindings.filter(f => f.severity === sev);
    if (sevFindings.length === 0) continue;

    const sevColors: Record<string, [number,number,number]> = {
      Critical: C.critical, High: C.high, Medium: C.medium, Low: C.low,
    };
    checkY(ctx, 30);
    ctx.pdf.setFillColor(...(sevColors[sev] ?? C.info));
    ctx.pdf.rect(margin, pdf_getY(ctx), ctx.contentW, 7, 'F');
    ctx.pdf.setFontSize(9);
    ctx.pdf.setFont('helvetica', 'bold');
    ctx.pdf.setTextColor(255, 255, 255);
    ctx.pdf.text(`${sev} Priority Remediations`, margin + 4, pdf_getY(ctx) + 4.8);
    pdf_setY(ctx, pdf_getY(ctx) + 11);

    const cats = [...new Set(sevFindings.map(f => f.category))];
    for (const cat of cats) {
      const catFindings = sevFindings.filter(f => f.category === cat);
      const rem = REMEDIATION[cat];
      checkY(ctx, 40);
      subHeading(ctx, `${cat} (${catFindings.length} finding${catFindings.length !== 1 ? 's' : ''})`);

      if (rem) {
        keyValueRow(ctx, 'Responsible Team', rem.team);
        keyValueRow(ctx, 'Target Timeline',  rem.timeline);
        keyValueRow(ctx, 'Verification',     rem.verify);
        pdf_setY(ctx, pdf_getY(ctx) + 3);
        bodyText(ctx, 'Remediation Steps:', 0);
        bodyText(ctx, rem.steps, 4);
      }

      // List affected assets
      const domains = [...new Set(catFindings.map(f => f.domain))];
      ctx.pdf.setFontSize(8);
      ctx.pdf.setFont('helvetica', 'bold');
      ctx.pdf.setTextColor(...C.pageMuted);
      ctx.pdf.text('Affected assets:', margin, pdf_getY(ctx));
      ctx.pdf.setFont('helvetica', 'normal');
      ctx.pdf.setTextColor(...C.pageText);
      ctx.pdf.text(domains.join(', '), margin + 28, pdf_getY(ctx), { maxWidth: ctx.contentW - 28 });
      pdf_setY(ctx, pdf_getY(ctx) + 8);
    }
  }

  // General hardening recommendations
  checkY(ctx, 50);
  subHeading(ctx, 'General Hardening Recommendations');
  const genRecs = [
    ['Enable DNSSEC',                    'Prevents DNS spoofing and cache poisoning attacks against your domain.'],
    ['Implement CAA DNS records',         'Restrict which Certificate Authorities can issue certificates for your domain.'],
    ['Audit and remove stale DNS records','Dangling DNS records can be exploited for subdomain takeover.'],
    ['Deploy WAF',                        'A web application firewall provides an additional layer of protection against common web attacks.'],
    ['Regular certificate monitoring',   'Set up automated alerts when certificates approach expiry (30/7/1 day thresholds).'],
    ['Security header monitoring',       'Include security header checks in your CI/CD pipeline or scheduled monitoring.'],
  ];
  autoTable(ctx.pdf, {
    startY: pdf_getY(ctx),
    margin: { left: margin, right: margin },
    head: [['Recommendation', 'Rationale']],
    body: genRecs,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
    alternateRowStyles: { fillColor: C.tableRow1 },
    theme: 'grid',
  });
  pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
}

// ── Section 10 — Analytics ────────────────────────────────────────────────────

function buildAnalyticsSection(ctx: ReportContext) {
  const { margin, contentW, allFindings, tlsScans, subScans } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);
  sectionHeading(ctx, '10. Analytics & Statistics', 'Quantitative security metrics and distribution analysis');

  // TLS score trend table (if multiple TLS scans)
  if (tlsScans.length > 1) {
    subHeading(ctx, 'TLS Score Trend Across Scans');
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['Scan', 'Domain', 'Date', 'Grade', 'Score', 'Critical', 'High', 'Medium']],
      body: [...tlsScans].reverse().map(s => {
        const sc = scoreFromTlsScan(s);
        return [s.id, s.domain, new Date(s.scannedAt).toLocaleDateString(), s.grade, `${sc}/100`,
          s.findingsCount.critical, s.findingsCount.high, s.findingsCount.medium];
      }),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'center' }, 4: { halign: 'right' } },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }

  // Subdomain discovery stats
  if (subScans.length > 0) {
    checkY(ctx, 40);
    subHeading(ctx, 'Subdomain Discovery Statistics');
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['Scan', 'Domain', 'Mode', 'Total', 'Resolved', 'Resolution %', 'HTTPS', 'Sources', 'Elapsed']],
      body: subScans.map(s => {
        const resPct = s.data.totalFound > 0 ? ((s.data.resolvedCount / s.data.totalFound) * 100).toFixed(1) + '%' : '—';
        const httpsCnt = s.data.subdomains.filter(e => e.httpsAvailable).length;
        const srcsCnt  = s.data.sourceSummaries?.filter(src => src.ran && src.found > 0).length ?? '—';
        return [s.id, s.data.domain, s.data.mode, s.data.totalFound, s.data.resolvedCount, resPct, httpsCnt, srcsCnt, elapsedLabel(s.elapsedMs)];
      }),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }

  // Findings distribution matrix
  if (allFindings.length > 0) {
    checkY(ctx, 40);
    subHeading(ctx, 'Findings Distribution by Category and Severity');
    const cats = [...new Set(allFindings.map(f => f.category))];
    const sevs = ['Critical', 'High', 'Medium', 'Low', 'Info'];
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['Category', ...sevs, 'Total']],
      body: cats.map(cat => {
        const row: (string | number)[] = [cat];
        let total = 0;
        for (const sev of sevs) {
          const n = allFindings.filter(f => f.category === cat && f.severity === sev).length;
          row.push(n > 0 ? n : '');
          total += n;
        }
        row.push(total);
        return row;
      }),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'center', cellWidth: 14 },
        3: { halign: 'center', cellWidth: 18 }, 4: { halign: 'center', cellWidth: 12 },
        5: { halign: 'center', cellWidth: 12 }, 6: { halign: 'right',  cellWidth: 14, fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.cell.raw !== '' && data.column.index > 0 && data.column.index <= 5) {
          const sevIdx = data.column.index - 1;
          const cols: [number,number,number][] = [C.critical, C.high, C.medium, C.low, C.info];
          if (sevIdx < cols.length) data.cell.styles.textColor = cols[sevIdx];
        }
      },
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }

  // Security header compliance
  if (tlsScans.length > 0) {
    checkY(ctx, 40);
    subHeading(ctx, 'Security Header Compliance Rate');
    const allHeaders = tlsScans.flatMap(s => s.data.securityHeaders);
    const headerNames = [...new Set(allHeaders.map(h => h.header))];
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['Header', 'Present Count', 'Missing Count', 'Compliance Rate', 'Severity']],
      body: headerNames.map(name => {
        const relevant = allHeaders.filter(h => h.header === name);
        const present  = relevant.filter(h => h.present).length;
        const missing  = relevant.length - present;
        const rate     = `${((present / relevant.length) * 100).toFixed(0)}%`;
        const sev      = relevant[0]?.severity?.toUpperCase() ?? '—';
        return [name, present, missing, rate, sev];
      }),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right', cellWidth: 28, fontStyle: 'bold' } },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const pct = parseInt(data.cell.raw as string, 10);
          data.cell.styles.textColor = pct >= 80 ? C.greenDark : pct >= 50 ? C.amber : C.critical;
        }
      },
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }
}

// ── Section 11 — Historical Comparison ────────────────────────────────────────

function buildHistoricalSection(ctx: ReportContext) {
  const { subScans, tlsScans, margin } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);
  sectionHeading(ctx, '11. Historical Comparison', 'Changes across scan history');

  if (subScans.length < 2 && tlsScans.length < 2) {
    bodyText(ctx, 'Historical comparison requires at least 2 scans of the same type. Run additional scans over time to see changes in your security posture, new subdomains appearing, and resolved vulnerabilities.');
    return;
  }

  // TLS score history
  if (tlsScans.length >= 2) {
    subHeading(ctx, 'TLS Score History');
    const sorted = [...tlsScans].reverse();
    autoTable(ctx.pdf, {
      startY: pdf_getY(ctx),
      margin: { left: margin, right: margin },
      head: [['Date', 'Domain', 'Grade', 'Score', 'Δ Score', 'Critical', 'High', 'HSTS', 'TLS 1.3']],
      body: sorted.map((s, i) => {
        const sc   = scoreFromTlsScan(s);
        const prev = i > 0 ? scoreFromTlsScan(sorted[i - 1]) : null;
        const delta = prev != null ? (sc - prev > 0 ? `+${sc - prev}` : String(sc - prev)) : '—';
        return [
          new Date(s.scannedAt).toLocaleDateString(),
          s.domain, s.grade, `${sc}/100`, delta,
          s.findingsCount.critical, s.findingsCount.high,
          s.data.httpsRedirect.hstsPresent ? 'Yes' : 'No',
          s.data.tlsSupport.tls13 ? 'Yes' : 'No',
        ];
      }),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right', cellWidth: 18, fontStyle: 'bold' } },
      alternateRowStyles: { fillColor: C.tableRow1 },
      theme: 'grid',
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          const v = data.cell.raw as string;
          if (v.startsWith('+')) data.cell.styles.textColor = C.greenDark;
          else if (v.startsWith('-')) data.cell.styles.textColor = C.critical;
        }
      },
    });
    pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);
  }

  // Subdomain delta
  if (subScans.length >= 2) {
    checkY(ctx, 40);
    subHeading(ctx, 'Subdomain Changes Between Scans');
    const latest   = subScans[0];
    const previous = subScans[1];
    const latestFqdns   = new Set(latest.data.subdomains.map(e => e.fqdn));
    const previousFqdns = new Set(previous.data.subdomains.map(e => e.fqdn));
    const newSubs     = [...latestFqdns].filter(f => !previousFqdns.has(f));
    const removedSubs = [...previousFqdns].filter(f => !latestFqdns.has(f));

    keyValueRow(ctx, 'Latest scan',    `${latest.id} (${new Date(latest.scannedAt).toLocaleDateString()}) — ${latest.data.totalFound} subdomains`);
    keyValueRow(ctx, 'Previous scan',  `${previous.id} (${new Date(previous.scannedAt).toLocaleDateString()}) — ${previous.data.totalFound} subdomains`);
    keyValueRow(ctx, 'New subdomains', String(newSubs.length));
    keyValueRow(ctx, 'Removed',        String(removedSubs.length));
    keyValueRow(ctx, 'Net change',     newSubs.length - removedSubs.length >= 0 ? `+${newSubs.length - removedSubs.length}` : String(newSubs.length - removedSubs.length));
    pdf_setY(ctx, pdf_getY(ctx) + 5);

    if (newSubs.length > 0) {
      checkY(ctx, 30);
      ctx.pdf.setFontSize(9);
      ctx.pdf.setFont('helvetica', 'bold');
      ctx.pdf.setTextColor(...C.critical);
      ctx.pdf.text(`New Subdomains (${newSubs.length}):`, margin, pdf_getY(ctx));
      pdf_setY(ctx, pdf_getY(ctx) + 5);
      ctx.pdf.setFont('helvetica', 'normal');
      ctx.pdf.setTextColor(...C.pageText);
      ctx.pdf.setFontSize(8);
      const newList = newSubs.slice(0, 60).join(', ') + (newSubs.length > 60 ? ` … +${newSubs.length - 60} more` : '');
      const lines = ctx.pdf.splitTextToSize(newList, ctx.contentW);
      ctx.pdf.text(lines, margin, pdf_getY(ctx));
      pdf_setY(ctx, pdf_getY(ctx) + lines.length * 4.8 + 4);
    }

    if (removedSubs.length > 0) {
      checkY(ctx, 20);
      ctx.pdf.setFontSize(9);
      ctx.pdf.setFont('helvetica', 'bold');
      ctx.pdf.setTextColor(...C.greenDark);
      ctx.pdf.text(`Removed Subdomains (${removedSubs.length}):`, margin, pdf_getY(ctx));
      pdf_setY(ctx, pdf_getY(ctx) + 5);
      ctx.pdf.setFont('helvetica', 'normal');
      ctx.pdf.setTextColor(...C.pageMuted);
      ctx.pdf.setFontSize(8);
      const rmList = removedSubs.slice(0, 40).join(', ') + (removedSubs.length > 40 ? ` … +${removedSubs.length - 40} more` : '');
      const lines = ctx.pdf.splitTextToSize(rmList, ctx.contentW);
      ctx.pdf.text(lines, margin, pdf_getY(ctx));
      pdf_setY(ctx, pdf_getY(ctx) + lines.length * 4.8 + 4);
    }
  }
}

// ── Section 12 — Appendices ────────────────────────────────────────────────────

function buildAppendicesSection(ctx: ReportContext) {
  const { margin, opts } = ctx;
  newPage(ctx);
  pdf_setY(ctx, ctx.margin + 4);
  sectionHeading(ctx, '12. Technical Appendices', 'Raw metadata, execution logs, and tool information');

  // Appendix A: Scan metadata
  subHeading(ctx, 'Appendix A — Scan Execution Log');
  autoTable(ctx.pdf, {
    startY: pdf_getY(ctx),
    margin: { left: margin, right: margin },
    head: [['Scan ID', 'Type', 'Domain', 'Status', 'Elapsed', 'Scanned At']],
    body: ctx.scans.map(s => [
      s.id, s.type, s.domain, s.status, elapsedLabel(s.elapsedMs),
      new Date(s.scannedAt).toISOString(),
    ]),
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.tableRow1 },
    theme: 'grid',
  });
  pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);

  // Appendix B: Tool versions
  checkY(ctx, 40);
  subHeading(ctx, 'Appendix B — Tool Versions & Sources');
  autoTable(ctx.pdf, {
    startY: pdf_getY(ctx),
    margin: { left: margin, right: margin },
    head: [['Tool / Source', 'Type', 'Version', 'Notes']],
    body: [
      ['WebSentinel Scanner',  'Platform',  'v1.0',     'Core platform, all scans initiated through this tool'],
      ['Subfinder',            'Binary',    'v2.17.0',  'Passive subdomain enumeration via 100+ sources'],
      ['Amass',                'Binary',    'v5.1.3',   'Attack surface mapping and asset discovery (OWASP)'],
      ['Sublist3r',            'Binary',    'v1.0',     'Subdomain enumeration via search engines and DNS'],
      ['crt.sh',               'API',       'Public',   'Certificate Transparency log aggregator'],
      ['HackerTarget',         'API',       'Public',   'DNS + subdomain enumeration (100 req/day free)'],
      ['RapidDNS',             'API',       'Public',   'Passive DNS database'],
      ['AlienVault OTX',       'API',       'Public',   'Threat intelligence passive DNS'],
      ['ThreatCrowd',          'API',       'Public',   'Threat intelligence subdomain data'],
      ['VirusTotal',           'API',       'v2 (opt)', 'Subdomain data (requires VT_API_KEY env var)'],
      ['URLScan.io',           'API',       'Public',   'Web scanning history — subdomain data'],
      ['Anubis-DB',            'API',       'Public',   'Passive subdomain database'],
      ['Node.js tls module',   'Built-in',  '—',        'TLS certificate inspection and version probing'],
      ['Node.js dns/promises', 'Built-in',  '—',        'DNS resolution (A, AAAA, CNAME records)'],
      ['Node.js https/http',   'Built-in',  '—',        'HTTPS/HTTP probing and security header retrieval'],
    ],
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: C.tableHead, textColor: [255,255,255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.tableRow1 },
    theme: 'grid',
  });
  pdf_setY(ctx, (ctx.pdf as any).lastAutoTable.finalY + 8);

  // Appendix C: Raw scan options (if enabled)
  if (opts.includeRawData) {
    checkY(ctx, 30);
    subHeading(ctx, 'Appendix C — Report Configuration');
    keyValueRow(ctx, 'Report ID',          ctx.reportId);
    keyValueRow(ctx, 'Target Domain',      opts.targetDomain);
    keyValueRow(ctx, 'Organization',       opts.organizationName);
    keyValueRow(ctx, 'Assessor',           opts.assessorName);
    keyValueRow(ctx, 'Classification',     opts.reportClassification);
    keyValueRow(ctx, 'Generation Time',    new Date(ctx.generatedAt).toISOString());
    keyValueRow(ctx, 'Sections Included',  Object.entries(opts.sections).filter(([,v]) => v).map(([k]) => k).join(', '));
    pdf_setY(ctx, pdf_getY(ctx) + 8);
  }

  // Limitations
  checkY(ctx, 40);
  subHeading(ctx, 'Appendix D — Scope Limitations & Disclaimers');
  bodyText(ctx, [
    '1. SCOPE: This report covers passive and semi-passive reconnaissance only. No authentication bypass, exploitation, social engineering, physical access, or client-side testing was performed.',
    '2. POINT-IN-TIME: All scan data reflects the state of the target at the time of each scan. Network configuration, certificates, and DNS records may have changed since the scans were run.',
    '3. CT LOG COMPLETENESS: Certificate Transparency log data from crt.sh may not reflect certificates issued through non-CT-compliant CAs or certs issued in the past 24–48 hours.',
    '4. DNS RESOLUTION: DNS results reflect the resolver used by the scanning server. Split-horizon DNS or CDN configurations may result in different results from other networks.',
    '5. TLS PROBING: TLS version support is determined by attempting handshakes with pinned min/max versions. Some servers may respond differently under load or from different source IPs.',
    '6. FALSE POSITIVES: Automated scanning may produce false positives. All findings should be verified manually before remediation is prioritised.',
    '7. TOOL AVAILABILITY: Results from Subfinder, Amass, and Sublist3r are only included when those binaries are installed and accessible to the scanning server.',
    '8. LEGAL: This assessment must only be conducted against systems you own or have explicit written authorisation to test. WebSentinel is not liable for unauthorised use.',
  ].join('\n\n'));
}

// ── Main entry point ───────────────────────────────────────────────────────────

export async function generateSecurityReport(
  scans: ScanRecord[],
  allFindings: Finding[],
  options: Partial<ReportOptions> = {},
): Promise<void> {
  const opts: ReportOptions = { ...DEFAULT_OPTIONS, ...options, sections: { ...DEFAULT_OPTIONS.sections, ...options.sections } };

  // Infer target domain from scan data if not provided
  if (!opts.targetDomain && scans.length > 0) {
    opts.targetDomain = scans[0].domain;
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.pageText);

  const ctx = initCtx(pdf, opts, scans, allFindings);

  // ── Build all pages ──
  buildCoverPage(ctx);

  // Reserve page 2 for TOC — we'll fill it after building all sections
  // (jsPDF doesn't support retroactive page insertion so we build sections first,
  //  then generate the TOC as the last page and reorder by using addPage at the right moment)

  if (opts.sections.executiveSummary)       buildExecutiveSummary(ctx);
  if (opts.sections.subdomainEnumeration)   buildSubdomainSection(ctx);
  if (opts.sections.certTransparency)       buildCertTransparencySection(ctx);
  if (opts.sections.dnsAnalysis)            buildDNSSection(ctx);
  if (opts.sections.tlsAssessment)          buildTLSSection(ctx);
  if (opts.sections.securityHeaders)        buildSecurityHeadersSection(ctx);
  if (opts.sections.findings)               buildFindingsSection(ctx);
  if (opts.sections.riskAssessment)         buildRiskSection(ctx);
  if (opts.sections.mitigation)             buildMitigationSection(ctx);
  if (opts.sections.analytics)             buildAnalyticsSection(ctx);
  if (opts.sections.historicalComparison)   buildHistoricalSection(ctx);
  if (opts.sections.appendices)            buildAppendicesSection(ctx);

  // TOC appended at end (limitation of jsPDF — can't insert pages mid-document)
  buildTOC(ctx);

  // ── Save ──
  const domain = opts.targetDomain.replace(/[^a-z0-9\-]/gi, '-').toLowerCase() || 'report';
  const dateStr = new Date().toISOString().slice(0, 10);
  pdf.save(`websentinel-${domain}-${dateStr}.pdf`);
}
