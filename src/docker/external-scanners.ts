import { accessSync, constants, existsSync, readFileSync } from "fs";
import { delimiter, dirname, join } from "path";
import type { DockerIssue, DockerSeverity } from "../types";

export type ScannerName = "hadolint" | "trivy" | "docker-scout";

export interface ScannerResult {
  name: ScannerName;
  status: "ok" | "skipped" | "unavailable" | "error";
  issuesFound: number;
  issues: DockerIssue[];
}

export interface ExternalScannerOptions {
  dockerfilePath: string;
  projectPath: string;
  skipHadolint?: boolean;
  skipTrivy?: boolean;
  skipDockerScout?: boolean;
}

function findExecutableInPath(binName: string): string | null {
  const pathValue = process.env.PATH ?? "";
  const parts = pathValue.split(delimiter);
  for (const p of parts) {
    const candidate = join(p, binName);
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function binaryForScanner(name: ScannerName): string {
  if (name === "docker-scout") return "docker";
  return name;
}

export async function isScannerAvailable(name: ScannerName): Promise<boolean> {
  return findExecutableInPath(binaryForScanner(name)) !== null;
}

async function runWithTimeout(
  cmd: string[],
  timeoutMs: number,
  cwd?: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  const proc = Bun.spawn({
    cmd,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {}
  }, timeoutMs);

  try {
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return { exitCode, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

export function mapHadolintCode(code: string): { kind: DockerIssue["kind"]; severity: DockerSeverity } {
  if (code === "DL3007") return { kind: "pin-version", severity: "high" };
  if (code === "DL3002") return { kind: "missing-cmd", severity: "high" };
  if (code === "DL3008" || code === "DL3009") return { kind: "missing-flag", severity: "medium" };
  return { kind: "advisory", severity: "info" };
}

function hadolintRuleUrl(code: string): string {
  return `https://github.com/hadolint/hadolint/wiki/${encodeURIComponent(code)}`;
}

export function parseHadolintJson(stdout: string, dockerLines: string[]): DockerIssue[] {
  let parsed: Array<Record<string, unknown>> = [];
  try {
    parsed = JSON.parse(stdout) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    return [];
  }

  const issues: DockerIssue[] = [];

  for (const item of parsed) {
    const code = typeof item.code === "string" ? item.code : "DL0000";
    const message = typeof item.message === "string" ? item.message : "Hadolint issue";
    const line = typeof item.line === "number" ? item.line : 1;
    const original = dockerLines[line - 1]?.trim() ?? "";
    const { kind, severity } = mapHadolintCode(code);
    const remediationGuide = [
      `Hadolint ${code}: ${message}`,
      `Regla: ${code}`,
      `Docs: ${hadolintRuleUrl(code)}`,
      original ? `Instrucción afectada: ${original}` : "",
      "Aplica el cambio recomendado por la regla y vuelve a correr el linter.",
    ].filter((x) => x !== "").join("\n");

    issues.push({
      line,
      kind,
      severity,
      source: "hadolint",
      hadolintCode: code,
      description: message,
      original,
      replacement: null,
      remediationGuide,
    });
  }

  return issues;
}

export async function runHadolint(dockerfilePath: string): Promise<ScannerResult> {
  if (!(await isScannerAvailable("hadolint"))) {
    return { name: "hadolint", status: "unavailable", issuesFound: 0, issues: [] };
  }

  const { exitCode, stdout, stderr, timedOut } = await runWithTimeout(
    ["hadolint", "-f", "json", dockerfilePath],
    10_000,
    dirname(dockerfilePath),
  );

  if (timedOut) {
    return { name: "hadolint", status: "error", issuesFound: 0, issues: [] };
  }

  if (exitCode !== 0 && exitCode !== 1) {
    void stderr;
    return { name: "hadolint", status: "error", issuesFound: 0, issues: [] };
  }

  const dockerLines = readFileSync(dockerfilePath, "utf-8").split("\n");
  const issues = parseHadolintJson(stdout, dockerLines);
  if (issues.length === 0 && stdout.trim() !== "[]") {
    return { name: "hadolint", status: "error", issuesFound: 0, issues: [] };
  }

  return { name: "hadolint", status: "ok", issuesFound: issues.length, issues };
}

export function mapTrivySeverity(sev: string): DockerSeverity {
  if (sev === "CRITICAL") return "critical";
  if (sev === "HIGH") return "high";
  if (sev === "MEDIUM") return "medium";
  if (sev === "LOW") return "low";
  return "info";
}

function nvdUrl(cveId: string): string {
  return `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}`;
}

export async function runTrivy(projectPath: string): Promise<ScannerResult> {
  if (!(await isScannerAvailable("trivy"))) {
    return { name: "trivy", status: "unavailable", issuesFound: 0, issues: [] };
  }

  const { exitCode, stdout, stderr, timedOut } = await runWithTimeout(
    ["trivy", "fs", "--scanners", "vuln", "--format", "json", projectPath],
    60_000,
    projectPath,
  );

  if (timedOut) {
    return { name: "trivy", status: "error", issuesFound: 0, issues: [] };
  }

  if (exitCode !== 0) {
    void stderr;
    return { name: "trivy", status: "error", issuesFound: 0, issues: [] };
  }

  const issues = parseTrivyJson(stdout);
  if (issues.length === 0 && stdout.trim() !== "{}") {
    return { name: "trivy", status: "error", issuesFound: 0, issues: [] };
  }

  return { name: "trivy", status: "ok", issuesFound: issues.length, issues };
}

export function parseTrivyJson(stdout: string): DockerIssue[] {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return [];
  }

  const results = Array.isArray(parsed.Results) ? (parsed.Results as Array<Record<string, unknown>>) : [];
  const seen = new Set<string>();
  const issues: DockerIssue[] = [];

  for (const r of results) {
    const vulns = Array.isArray(r.Vulnerabilities) ? (r.Vulnerabilities as Array<Record<string, unknown>>) : [];
    for (const v of vulns) {
      const cveId = typeof v.VulnerabilityID === "string" ? v.VulnerabilityID : null;
      if (!cveId) continue;
      if (seen.has(cveId)) continue;
      seen.add(cveId);

      const severityRaw = typeof v.Severity === "string" ? v.Severity : "UNKNOWN";
      const severity = mapTrivySeverity(severityRaw);
      const pkg = typeof v.PkgName === "string" ? v.PkgName : "package";
      const fixedVersion = typeof v.FixedVersion === "string" ? v.FixedVersion : undefined;

      const description = fixedVersion
        ? `${cveId} en ${pkg} (fix: ${fixedVersion})`
        : `${cveId} en ${pkg}`;

      const remediationGuide = [
        `Trivy detectó ${cveId} con severidad ${severityRaw}.`,
        `Paquete: ${pkg}`,
        fixedVersion ? `Versión con fix: ${fixedVersion}` : "No se informó versión con fix.",
        `NVD: ${nvdUrl(cveId)}`,
        "Solución recomendada: actualiza el paquete afectado y/o la imagen base para incluir el fix.",
      ].join("\n");

      issues.push({
        line: 1,
        kind: "advisory",
        severity,
        source: "trivy",
        cveId,
        description,
        original: "trivy",
        replacement: null,
        remediationGuide,
      });
    }
  }

  return issues;
}

function parseFromImages(dockerfileContent: string): string[] {
  const images: string[] = [];
  const lines = dockerfileContent.split("\n");
  for (const l of lines) {
    const trimmed = l.trim();
    const m = trimmed.match(/^FROM\s+(?:--\S+\s+)*([^\s]+)(?:\s+AS\s+\S+)?/i);
    if (!m) continue;
    const image = m[1]!;
    images.push(image);
  }
  return Array.from(new Set(images));
}

function looksLikeAuthIssue(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return s.includes("not logged in") || s.includes("unauthorized") || s.includes("authentication");
}

export async function runDockerScout(dockerfilePath: string): Promise<ScannerResult> {
  if (!(await isScannerAvailable("docker-scout"))) {
    return { name: "docker-scout", status: "unavailable", issuesFound: 0, issues: [] };
  }

  const content = readFileSync(dockerfilePath, "utf-8");
  const images = parseFromImages(content);
  if (images.length === 0) {
    return { name: "docker-scout", status: "ok", issuesFound: 0, issues: [] };
  }

  const issues: DockerIssue[] = [];

  for (const image of images) {
    const { exitCode, stdout, stderr, timedOut } = await runWithTimeout(
      ["docker", "scout", "cves", "--format", "json", image],
      30_000,
      dirname(dockerfilePath),
    );

    if (timedOut) {
      return { name: "docker-scout", status: "error", issuesFound: 0, issues: [] };
    }

    if (exitCode !== 0) {
      if (looksLikeAuthIssue(stderr)) {
        return { name: "docker-scout", status: "unavailable", issuesFound: 0, issues: [] };
      }
      return { name: "docker-scout", status: "error", issuesFound: 0, issues: [] };
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(stdout) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    const description = parsed ? `Docker Scout reportó CVEs para ${image}` : `Docker Scout analizó ${image}`;
    const remediationGuide = [
      `Docker Scout detectó hallazgos para la imagen base: ${image}`,
      "Solución recomendada: actualiza la imagen base (FROM) a una versión más reciente y vuelve a escanear.",
      "Sugerencia: ejecuta `docker scout recommendations <imagen>` para ver tags recomendados.",
    ].join("\n");

    issues.push({
      line: 1,
      kind: "update-from",
      severity: "medium",
      source: "docker-scout",
      description,
      original: `FROM ${image}`,
      replacement: null,
      remediationGuide,
    });
  }

  return { name: "docker-scout", status: "ok", issuesFound: issues.length, issues };
}

export async function runExternalScanners(opts: ExternalScannerOptions): Promise<ScannerResult[]> {
  const tasks: Array<Promise<ScannerResult>> = [];

  tasks.push(
    opts.skipHadolint
      ? Promise.resolve({ name: "hadolint", status: "skipped", issuesFound: 0, issues: [] })
      : runHadolint(opts.dockerfilePath).catch(() => ({ name: "hadolint", status: "error", issuesFound: 0, issues: [] })),
  );

  tasks.push(
    opts.skipTrivy
      ? Promise.resolve({ name: "trivy", status: "skipped", issuesFound: 0, issues: [] })
      : runTrivy(opts.projectPath).catch(() => ({ name: "trivy", status: "error", issuesFound: 0, issues: [] })),
  );

  tasks.push(
    opts.skipDockerScout
      ? Promise.resolve({ name: "docker-scout", status: "skipped", issuesFound: 0, issues: [] })
      : runDockerScout(opts.dockerfilePath).catch(() => ({ name: "docker-scout", status: "error", issuesFound: 0, issues: [] })),
  );

  return Promise.all(tasks);
}
