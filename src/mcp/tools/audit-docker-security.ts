import { z } from "zod";
import { detectProject } from "../../checks/detect-project";
import { analyzeDockerfile } from "../../docker/analyze-dockerfile";
import { runExternalScanners } from "../../docker/external-scanners";
import { evaluateQualityGate } from "../../docker/quality-gate";
import type { DockerSecurityReport, DockerSeverity, ScannerStatus } from "../../types";
import type { ToolDefinition } from "../types";

function buildLlmFixInstructions(issues: DockerSecurityReport["issues"]): string {
  const external = issues.filter((i) => i.source && i.source !== "internal");
  const internalFixable = issues.filter((i) => (i.source ?? "internal") === "internal" && i.replacement !== null);
  const externalCount = external.length;
  const internalFixableCount = internalFixable.length;

  return [
    "Instrucciones para aplicar fixes de Docker security:",
    `1) Aplica primero los fixes automáticos internos (replacement no nulo). Total: ${internalFixableCount}.`,
    `2) Para issues de scanners externos (replacement: null), genera un Dockerfile completo corregido como buildFixProposal. Total: ${externalCount}.`,
    "3) Aplica el buildFixProposal y (si corresponde) verifica con docker build.",
  ].join("\n");
}

export function createAuditDockerSecurityTool(deps = {
  detectProject,
  analyzeDockerfile,
  runExternalScanners,
  evaluateQualityGate,
}): ToolDefinition {
  return {
    name: "locksmith_audit_docker_security",
    description:
      "Run a combined Docker security audit: internal Dockerfile checks plus optional external scanners (Hadolint, Trivy, Docker Scout). " +
      "Gracefully degrades when scanners are unavailable.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
      failOn: z.enum(["critical", "high", "medium", "low", "none"]).optional().describe("Severity threshold to fail the quality gate"),
      skipHadolint: z.boolean().optional().default(false),
      skipTrivy: z.boolean().optional().default(false),
      skipDockerScout: z.boolean().optional().default(false),
    },
    async handler(args) {
      const projectPath = args.projectPath as string;
      const failOn = (args.failOn as DockerSeverity | "none" | undefined) ?? "high";
      const skipHadolint = Boolean(args.skipHadolint);
      const skipTrivy = Boolean(args.skipTrivy);
      const skipDockerScout = Boolean(args.skipDockerScout);

      try {
        const project = await deps.detectProject(projectPath);
        const analyses = deps.analyzeDockerfile(projectPath, project.type, { security: true });

        const scanners: ScannerStatus[] = [
          { name: "hadolint", status: skipHadolint ? "skipped" : "unavailable", issuesFound: 0 },
          { name: "trivy", status: skipTrivy ? "skipped" : "unavailable", issuesFound: 0 },
          { name: "docker-scout", status: skipDockerScout ? "skipped" : "unavailable", issuesFound: 0 },
        ];

        if (analyses.length === 0 || !analyses[0]!.found) {
          const report: DockerSecurityReport = {
            found: false,
            dockerfilePath: null,
            issues: [],
            issueCount: 0,
            hasFixableIssues: false,
            qualityGatePassed: true,
            qualityGateSummary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
            internalChecksRan: true,
            scanners,
            llmFixInstructions: "No se encontraron Dockerfiles en el projectPath proporcionado.",
          };
          return { content: [{ type: "text", text: JSON.stringify(report) }] };
        }

        const best = analyses.reduce(
          (a, b) => a.issues.length >= b.issues.length ? a : b,
          analyses[0]!,
        );

        const [scannerResults] = await Promise.all([
          deps.runExternalScanners({
            dockerfilePath: best.dockerfilePath!,
            projectPath,
            skipHadolint,
            skipTrivy,
            skipDockerScout,
          }),
        ]);

        const mergedIssues = [
          ...best.issues,
          ...scannerResults.flatMap((r) => r.issues),
        ];

        for (const s of scanners) {
          const r = scannerResults.find((x) => x.name === s.name);
          if (!r) continue;
          s.status = r.status;
          s.issuesFound = r.issuesFound;
        }

        const { qualityGatePassed, qualityGateSummary } = deps.evaluateQualityGate(mergedIssues, failOn);

        const hasExternal = mergedIssues.some((i) => i.source && i.source !== "internal");
        const report: DockerSecurityReport = {
          found: true,
          dockerfilePath: best.dockerfilePath,
          issues: mergedIssues,
          issueCount: mergedIssues.length,
          hasFixableIssues: mergedIssues.some((i) => i.replacement !== null),
          qualityGatePassed,
          qualityGateSummary,
          internalChecksRan: true,
          scanners,
          llmFixInstructions: hasExternal ? buildLlmFixInstructions(mergedIssues) : undefined,
        };

        return { content: [{ type: "text", text: JSON.stringify(report) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "INTERNAL_ERROR", message: String(err) }) }],
        };
      }
    },
  };
}

export const auditDockerSecurityTool = createAuditDockerSecurityTool();
