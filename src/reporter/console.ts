import pc from "picocolors";
import type { CheckResult } from "../types";

export function printReport(results: CheckResult[]): void {
  const fixed    = results.filter(r => r.wasFixed);
  const errors   = results.filter(r => r.status === "error" && !r.wasFixed);
  const warnings = results.filter(r => r.status === "warn"  && !r.wasFixed);
  const oks      = results.filter(r => r.status === "ok"    && !r.wasFixed);
  const allOk    = [...oks, ...fixed];

  printExecutiveSummary(errors.length, warnings.length, allOk.length);

  if (errors.length > 0)   printSection("ACCIÓN REQUERIDA", errors, "error");
  if (warnings.length > 0) printSection("ADVERTENCIAS", warnings, "warn");
  if (allOk.length > 0)    printCollapsedOk(allOk);
}

function printExecutiveSummary(errors: number, warns: number, oks: number): void {
  const parts: string[] = [];
  if (errors > 0) parts.push(pc.red(`${errors} ${errors === 1 ? "error" : "errores"}`));
  if (warns  > 0) parts.push(pc.yellow(`${warns} ${warns === 1 ? "advertencia" : "advertencias"}`));
  parts.push(pc.green(`${oks} ok`));
  console.log(`\n  ${parts.join(pc.dim(" · "))}\n`);
}

const SEP_WIDTH = 65;

function sectionHeader(title: string): string {
  const inner = `── ${title} `;
  const trailing = "─".repeat(Math.max(0, SEP_WIDTH - 2 - inner.length));
  return `  ${inner}${trailing}`;
}

function printSection(title: string, checks: CheckResult[], _level: "error" | "warn"): void {
  console.log(pc.dim(sectionHeader(title)));
  for (const r of checks) {
    printCheckRow(r);
    if (r.hint && r.hint.length > 0) printInlineHints(r.hint);
  }
  printActionPrompt(checks);
  console.log();
}

function printCheckRow(r: CheckResult): void {
  if (r.wasFixed) {
    console.log(`  ${pc.green("✓")} ${r.name}  ${r.message}  ${pc.green("[fixed]")}`);
    return;
  }
  if (r.status === "error") {
    console.log(`  ${pc.red("✗")} ${r.name}  ${r.message}`);
    return;
  }
  if (r.status === "warn") {
    console.log(`  ${pc.yellow("⚠")} ${r.name}  ${r.message}`);
    return;
  }
  console.log(`  ${pc.green("✓")} ${r.name}  ${r.message}`);
}

function printInlineHints(hints: string[]): void {
  for (const hint of hints) {
    console.log(pc.dim(`     ${hint}`));
  }
}

function printActionPrompt(checks: CheckResult[]): void {
  if (checks.some(r => r.fixable)) {
    console.log(pc.dim("  → locksmith . --fix"));
  }
}

function printCollapsedOk(checks: CheckResult[]): void {
  console.log(pc.dim(sectionHeader("TODO OK")));
  const names = checks
    .map(r => r.wasFixed ? `${r.name} ${pc.green("[fixed]")}` : r.name)
    .join(pc.dim(" · "));
  console.log(`  ${pc.green("✓")} ${names}  ${pc.dim(`(${checks.length} checks)`)}`);
  console.log();
}
