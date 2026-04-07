import pc from "picocolors";
import type { CheckResult } from "../types";

const ICON: Record<CheckResult["status"], string> = {
  ok:    "✓",
  warn:  "⚠",
  error: "✗",
};

const COLOR: Record<CheckResult["status"], (s: string) => string> = {
  ok:    pc.green,
  warn:  pc.yellow,
  error: pc.red,
};

export function printReport(results: CheckResult[]) {
  const nameW = Math.max(...results.map((r) => r.name.length), 20) + 2;
  const sep = "─".repeat(nameW + 50);

  console.log(pc.dim(sep));
  console.log(
    pc.bold(pc.dim("  " + "Check".padEnd(nameW) + "Estado   " + "Detalle"))
  );
  console.log(pc.dim(sep));

  for (const r of results) {
    const icon = COLOR[r.status](ICON[r.status]);
    const status = COLOR[r.status](r.status.toUpperCase().padEnd(8));
    const badge = r.wasFixed
      ? pc.bold(pc.green(" [fixed]"))
      : r.fixable
        ? pc.dim(" [--fix]")
        : "";
    console.log(`  ${icon} ${r.name.padEnd(nameW)}${status} ${r.message}${badge}`);
  }

  console.log(pc.dim(sep));

  const errors = results.filter((r) => r.status === "error").length;
  const warns  = results.filter((r) => r.status === "warn").length;
  const oks    = results.filter((r) => r.status === "ok").length;

  const summary = [
    oks    ? pc.green(`${oks} ok`)          : "",
    warns  ? pc.yellow(`${warns} advertencias`) : "",
    errors ? pc.red(`${errors} errores`)      : "",
  ].filter(Boolean).join(pc.dim(" · "));

  console.log(`\n  ${summary}\n`);

  const fixable = results.filter((r) => r.fixable).length;
  if (fixable > 0) {
    console.log(pc.dim(`  ${fixable} problema(s) con corrección automática disponible → ejecuta con --fix\n`));
  }

  const withHints = results.filter((r) => r.hint && r.hint.length > 0);
  if (withHints.length > 0) {
    for (const r of withHints) {
      console.log(pc.bold(pc.cyan(`  ℹ  ${r.name}`)));
      for (const line of r.hint!) {
        console.log(pc.dim(`     ${line}`));
      }
      console.log();
    }
  }
}
