import { writeFileSync } from "fs";
import { join } from "path";
import pc from "picocolors";
import type { CheckResult } from "../types";

export async function exportReport(
  results: CheckResult[],
  format: "json" | "markdown",
  projectPath: string
) {
  if (format === "json") {
    const out = {
      timestamp: new Date().toISOString(),
      summary: {
        ok:    results.filter((r) => r.status === "ok").length,
        warn:  results.filter((r) => r.status === "warn").length,
        error: results.filter((r) => r.status === "error").length,
      },
      checks: results.map(({ name, status, message, fixable }) => ({
        name, status, message, fixable: fixable ?? false,
      })),
    };
    const path = join(projectPath, "security-report.json");
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log(pc.green(`✓ Reporte JSON exportado → ${path}`));
  }

  if (format === "markdown") {
    const icon: Record<string, string> = { ok: "✅", warn: "⚠️", error: "❌" };
    const rows = results
      .map((r) => `| ${icon[r.status]} | ${r.name} | ${r.message} |`)
      .join("\n");

    const md = `# Security Report
> Generado: ${new Date().toISOString()}

| Estado | Check | Detalle |
|--------|-------|---------|
${rows}
`;
    const path = join(projectPath, "security-report.md");
    writeFileSync(path, md);
    console.log(pc.green(`✓ Reporte Markdown exportado → ${path}`));
  }
}
