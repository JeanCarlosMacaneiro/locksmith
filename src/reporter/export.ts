import { writeFileSync } from "fs";
import { join } from "path";
import pc from "picocolors";
import type { CheckResult } from "../types";

interface JsonCheck {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  fixable: boolean;
  wasFixed: boolean;
}

function toJsonCheck(r: CheckResult): JsonCheck {
  return {
    name:     r.name,
    status:   r.status,
    message:  r.message,
    fixable:  r.fixable  ?? false,
    wasFixed: r.wasFixed ?? false,
  };
}

export async function exportReport(
  results: CheckResult[],
  format: "json" | "markdown",
  projectPath: string
): Promise<void> {
  const fixed    = results.filter(r => r.wasFixed);
  const errors   = results.filter(r => r.status === "error" && !r.wasFixed);
  const warnings = results.filter(r => r.status === "warn"  && !r.wasFixed);
  const oks      = results.filter(r => r.status === "ok"    && !r.wasFixed);
  const allOk    = [...oks, ...fixed];

  if (format === "json") {
    const out = {
      timestamp: new Date().toISOString(),
      summary: {
        ok:    allOk.length,
        warn:  warnings.length,
        error: errors.length,
      },
      sections: {
        errors:   errors.map(toJsonCheck),
        warnings: warnings.map(toJsonCheck),
        ok:       allOk.map(toJsonCheck),
      },
      checks: results.map(toJsonCheck),
    };
    const path = join(projectPath, "security-report.json");
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log(pc.green(`✓ Reporte JSON exportado → ${path}`));
  }

  if (format === "markdown") {
    const icon: Record<string, string> = { ok: "✅", warn: "⚠️", error: "❌" };
    let md = `# Security Report\n> Generado: ${new Date().toISOString()}\n`;

    if (errors.length > 0) {
      const rows = errors.map(r => `| ${icon.error} | ${r.name} | ${r.message} |`).join("\n");
      md += `\n## Errores\n| Estado | Check | Detalle |\n|--------|-------|------|\n${rows}\n`;
    }

    if (warnings.length > 0) {
      const rows = warnings.map(r => `| ${icon.warn} | ${r.name} | ${r.message} |`).join("\n");
      md += `\n## Advertencias\n| Estado | Check | Detalle |\n|--------|-------|------|\n${rows}\n`;
    }

    if (allOk.length > 0) {
      const rows = allOk.map(r =>
        `| ${icon.ok} | ${r.name}${r.wasFixed ? " [fixed]" : ""} | ${r.message} |`
      ).join("\n");
      md += `\n## OK\n| Estado | Check | Detalle |\n|--------|-------|------|\n${rows}\n`;
    }

    const path = join(projectPath, "security-report.md");
    writeFileSync(path, md);
    console.log(pc.green(`✓ Reporte Markdown exportado → ${path}`));
  }
}
