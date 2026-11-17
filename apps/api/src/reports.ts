import PDFDocument from 'pdfkit';
import type { PrismaClient } from '@mirror/db';
import fs from 'node:fs';
import { computeSha256, nowIso, resolveFromRoot, stableStringify } from '@mirror/shared';

const LOGO_PATH = resolveFromRoot('apps/api/assets/mirror-logo-black.png');

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export async function buildRunReport(prisma: PrismaClient, runId: string, userId: string) {
  const run = await prisma.executionRun.findFirst({
    where: { id: runId, experiment: { investigation: { userId } } },
    include: {
      experiment: {
        include: {
          sessions: { orderBy: { createdAt: 'asc' } },
          journeys: { orderBy: { version: 'desc' }, take: 1, include: { steps: { orderBy: { sequence: 'asc' } } } },
          investigation: { include: { authorizationScope: true } }
        }
      },
      findings: true,
      artifacts: { orderBy: { createdAt: 'asc' } },
      observations: { select: { id: true, sessionId: true, checkpoint: true, capturedAt: true } }
    }
  });
  if (!run) return null;

  const inv = run.experiment.investigation;
  const findings = [...run.findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || a.checkpoint.localeCompare(b.checkpoint)
  );
  const body = {
    reportVersion: 1,
    generatedAt: nowIso(),
    disclaimer:
      'MIRROR reports what was observed under controlled conditions. Observed differences may have legitimate causes ' +
      '(localisation, experiments, inventory, timing). This report does not allege intent or unlawful conduct.',
    investigation: {
      id: inv.id,
      title: inv.title,
      description: inv.description,
      targetUrl: inv.targetUrl,
      authorization: {
        permittedDomain: inv.authorizationScope.permittedDomain,
        purpose: inv.authorizationScope.purpose,
        acknowledgedAt: inv.authorizationScope.acknowledgedAt.toISOString()
      }
    },
    experiment: {
      id: run.experiment.id,
      name: run.experiment.name,
      normalizationVersion: run.experiment.normalizationVersion,
      journey: run.experiment.journeys[0]
        ? {
            name: run.experiment.journeys[0].name,
            version: run.experiment.journeys[0].version,
            steps: run.experiment.journeys[0].steps.map((s) => s.configuration)
          }
        : null,
      sessions: run.experiment.sessions.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.sessionRole,
        configuration: s.configuration,
        configurationFingerprint: s.configurationFingerprint
      }))
    },
    run: {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      error: run.error,
      execution: run.executionMetadata
    },
    summary: {
      findings: findings.length,
      bySeverity: findings.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {}),
      byType: findings.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.type]: (acc[f.type] ?? 0) + 1 }), {})
    },
    findings: findings.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      classification: f.classification,
      confidence: f.confidence,
      confidenceRationale: f.confidenceRationale,
      checkpoint: f.checkpoint,
      description: f.description,
      baselineSessionId: f.baselineSessionId,
      comparisonSessionId: f.comparisonSessionId,
      details: f.details,
      evidenceReferences: f.evidenceReferences
    })),
    observations: run.observations.map((o) => ({ id: o.id, sessionId: o.sessionId, checkpoint: o.checkpoint, capturedAt: o.capturedAt.toISOString() })),
    evidence: run.artifacts.map((a) => ({
      id: a.id,
      type: a.type,
      observationId: a.observationId,
      storageKey: a.storageKey,
      sha256: a.sha256,
      size: a.size,
      createdAt: a.createdAt.toISOString()
    }))
  };
  // The report carries its own content digest so recipients can detect modification.
  return { ...body, reportSha256: computeSha256(stableStringify(body)) };
}

export type RunReport = NonNullable<Awaited<ReturnType<typeof buildRunReport>>>;

const COLORS = { text: '#111827', muted: '#4B5563', accent: '#6D28D9', high: '#B42318', medium: '#B54708', low: '#175CD3', info: '#475467' };

export function renderReportPdf(report: RunReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `MIRROR report - ${report.investigation.title}`, Producer: 'MIRROR' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const mono = 'Courier';
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, 50, 40, { height: 42 });
      doc.y = 96;
    }
    doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(9).text('DIFFERENTIAL TESTING REPORT');
    doc.moveDown(0.5);
    doc.fillColor(COLORS.text).fontSize(20).text(report.investigation.title);
    doc.moveDown(0.3);
    doc.font(mono).fontSize(8).fillColor(COLORS.muted).text(`Run ${report.run.id}   Status ${report.run.status}   Generated ${report.generatedAt}`);
    doc.text(`Target ${report.investigation.targetUrl}`);
    doc.text(`Authorized scope ${report.investigation.authorization.permittedDomain} — ${report.investigation.authorization.purpose}`);
    doc.moveDown();
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.muted).text(report.disclaimer);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text).text('Sessions');
    doc.moveDown(0.3);
    for (const s of report.experiment.sessions) {
      const cfg = s.configuration as { locale?: string; timezoneId?: string; viewport?: { width: number; height: number }; extraHeaders?: Record<string, string> };
      doc.font('Helvetica-Bold').fontSize(10).text(`${s.name} (${s.role})`, { continued: true });
      doc.font('Helvetica').fillColor(COLORS.muted).text(
        `  ${cfg.locale ?? ''} · ${cfg.timezoneId ?? ''} · ${cfg.viewport?.width}×${cfg.viewport?.height}${cfg.extraHeaders ? ` · headers: ${Object.keys(cfg.extraHeaders).join(', ')}` : ''}`
      );
      doc.font(mono).fontSize(7).text(`fingerprint ${s.configurationFingerprint}`);
      doc.fillColor(COLORS.text);
    }
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text).text(`Findings (${report.findings.length})`);
    doc.moveDown(0.3);
    if (!report.findings.length) doc.font('Helvetica').fontSize(10).text('No differences were detected between the sessions.');
    report.findings.forEach((f, i) => {
      const color = (COLORS as Record<string, string>)[f.severity] ?? COLORS.text;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(color).text(`${i + 1}. ${f.severity.toUpperCase()} · ${f.type.replace(/_/g, ' ')}`, { continued: true });
      doc.font('Helvetica').fillColor(COLORS.muted).text(`   ${f.classification.replace(/_/g, ' ')} · confidence ${f.confidence.toFixed(2)} · checkpoint ${f.checkpoint}`);
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.text).text(f.description);
      const d = f.details as { baseline?: { value: string | null; sourceLocator?: string } | null; comparison?: { value: string | null; sourceLocator?: string } | null };
      doc.font(mono).fontSize(7).fillColor(COLORS.muted);
      doc.text(`baseline:   ${d.baseline?.value ?? '(absent)'}${d.baseline?.sourceLocator ? `  @ ${d.baseline.sourceLocator}` : ''}`);
      doc.text(`comparison: ${d.comparison?.value ?? '(absent)'}${d.comparison?.sourceLocator ? `  @ ${d.comparison.sourceLocator}` : ''}`);
      doc.text(`evidence:   ${f.evidenceReferences && Array.isArray(f.evidenceReferences) ? (f.evidenceReferences as string[]).join(', ') : ''}`);
      doc.text(`finding id: ${f.id}`);
      doc.moveDown(0.6);
    });

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text).text('Evidence manifest');
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text('SHA-256 digests of every captured artifact. Recompute to verify integrity.');
    doc.moveDown(0.5);
    for (const a of report.evidence) {
      doc.font(mono).fontSize(7).fillColor(COLORS.text).text(`${a.type.padEnd(17)} ${a.sha256}  ${a.size} B`);
      doc.fillColor(COLORS.muted).text(`                  ${a.storageKey}`);
    }
    doc.moveDown();
    doc.font(mono).fontSize(8).fillColor(COLORS.accent).text(`Report content digest (JSON) ${report.reportSha256}`);
    doc.end();
  });
}
