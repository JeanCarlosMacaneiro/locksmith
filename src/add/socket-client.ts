import pc from "picocolors";
import { bunShell } from "./shell";
import type { SocketScore } from "../types";

export async function querySocket(
  packageName: string,
  version: string,
): Promise<SocketScore | null> {
  let output: string;
  try {
    const result = await bunShell.$`socket package shallow npm ${packageName}@${version} --json`.quiet();
    output = result.stdout.toString();
  } catch (err) {
    const msg = String(err);
    if (msg.includes("not found") || msg.includes("ENOENT") || msg.includes("command not found")) {
      process.stderr.write(pc.yellow("⚠ Socket CLI not found in PATH. Continuing with Layer 1 only.\n"));
    } else {
      process.stderr.write(pc.yellow(`⚠ Error running Socket CLI: ${msg}. Continuing with Layer 1.\n`));
    }
    return null;
  }

  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const supplyChainRisk = typeof parsed.supplyChainRisk === "number" ? parsed.supplyChainRisk : 0;
    const rawAlerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
    const alerts = rawAlerts.map((a: unknown) => {
      const alert = a as Record<string, unknown>;
      return {
        severity: (alert.severity ?? "low") as "critical" | "high" | "middle" | "low",
        type: String(alert.type ?? "unknown"),
      };
    });
    return { supplyChainRisk, alerts };
  } catch {
    process.stderr.write(pc.yellow("⚠ Could not parse Socket CLI output. Continuing with Layer 1.\n"));
    return null;
  }
}
