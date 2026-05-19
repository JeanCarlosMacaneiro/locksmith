import type { DangerousScript } from "../types";
import { normalizeScript } from "./script-inspector";
import type { PyPIInfo } from "./pypi-client";

export const PYTHON_DANGEROUS_PATTERNS = [
  "os.system",
  "subprocess",
  "exec(",
  "eval(",
  "base64",
  "urllib.request",
  "socket.connect",
  "reverse shell",
  "backdoor",
  "curl",
  "wget",
  "bash -c",
  "sh -c",
] as const;

export function inspectPyPIMetadata(info: Pick<PyPIInfo, "summary" | "description">): DangerousScript[] {
  const result: DangerousScript[] = [];
  const fields: Array<{ name: string; value: string }> = [
    { name: "metadata:summary", value: info.summary },
    { name: "metadata:description", value: info.description.slice(0, 2000) },
  ];

  for (const { name, value } of fields) {
    if (!value) continue;
    const normalized = normalizeScript(value);
    const found = (PYTHON_DANGEROUS_PATTERNS as readonly string[]).filter((p) =>
      normalized.includes(p),
    );
    if (found.length > 0) {
      result.push({ scriptName: name, value: value.slice(0, 200), patterns: found });
    }
  }

  return result;
}
