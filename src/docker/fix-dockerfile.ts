import { writeFileSync } from "fs";
import type { DockerfileAnalysis } from "../types";

export function applyDockerfileFix(analysis: DockerfileAnalysis): void {
  if (!analysis.dockerfilePath || !analysis.proposedContent) return;
  writeFileSync(analysis.dockerfilePath, analysis.proposedContent);
}
