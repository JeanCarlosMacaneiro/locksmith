import pc from "picocolors";
import type { PackageSecurityInfo, DangerousScript, SocketScore } from "../types";

export function determineRiskLevel(
  dangerousScripts: DangerousScript[],
  socketScore: SocketScore | undefined,
): "none" | "medium" | "critical" {
  if (socketScore?.alerts.some((a) => a.type === "malware")) return "critical";
  if (dangerousScripts.length > 0) return "medium";
  return "none";
}

export function buildReport(info: PackageSecurityInfo): string {
  const lines: string[] = [];

  const riskBadge =
    info.riskLevel === "critical" ? pc.red("✗ CRÍTICO")
    : info.riskLevel === "medium"   ? pc.yellow("⚠ MEDIO")
    : pc.green("✓ Sin riesgos");

  lines.push(pc.bold(`\n🔐 locksmith — análisis de seguridad`));
  lines.push(`   Paquete: ${pc.bold(info.name)}@${pc.cyan(info.resolvedVersion)}`);
  lines.push(`   Riesgo:  ${riskBadge}\n`);

  if (info.riskLevel === "medium" && info.dangerousScripts.length > 0) {
    lines.push(pc.yellow("   Scripts peligrosos detectados:"));
    for (const ds of info.dangerousScripts) {
      lines.push(`     ${pc.bold(ds.scriptName)}: ${ds.value}`);
      lines.push(`       Patrones: ${ds.patterns.join(", ")}`);
    }
    lines.push("");
  }

  if (info.socketScore) {
    lines.push(`   Socket.dev Supply Chain Risk: ${pc.bold(String(info.socketScore.supplyChainRisk))}`);
    if (info.socketScore.alerts.length > 0) {
      lines.push("   Alertas:");
      for (const alert of info.socketScore.alerts) {
        const color = alert.severity === "critical" ? pc.red : alert.severity === "high" ? pc.yellow : pc.dim;
        lines.push(`     ${color(`[${alert.severity}]`)} ${alert.type}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function printReport(info: PackageSecurityInfo): void {
  process.stdout.write(buildReport(info));
}
