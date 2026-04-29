import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { buildMcpConfig } from "./installer";

export interface InstallProjectMcpOptions {
  projectPath: string;
  locksmithRoot: string;
  targets?: InstallProjectMcpTarget[];
}

export type InstallProjectMcpTarget =
  | "trae"
  | "cursor"
  | "windsurf"
  | "cline"
  | "copilot"
  | "agents";

function safeReadJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    writeFileSync(path + ".bak", raw);
    return null;
  }
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function copyIfMissing(src: string, dest: string): boolean {
  if (existsSync(dest)) return false;
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  return true;
}

export async function installProjectMcp(opts: InstallProjectMcpOptions): Promise<{ created: string[] }>{
  const aiSkillSrc = join(opts.locksmithRoot, "docs", "ai-skill.md");
  const mcpEntry = join(opts.locksmithRoot, "bin", "mcp.ts");

  if (!existsSync(aiSkillSrc)) {
    throw new Error(`Missing file: ${aiSkillSrc}`);
  }

  const created: string[] = [];

  const targets = new Set<InstallProjectMcpTarget>(
    (opts.targets ?? ["trae", "cursor", "windsurf", "cline", "copilot", "agents"]) satisfies InstallProjectMcpTarget[]
  );

  if (targets.size === 0) return { created };

  if (targets.has("trae")) {
    const traeMcpPath = join(opts.projectPath, ".trae", "mcp.json");
    const traeRulesPath = join(opts.projectPath, ".trae", "rules", "locksmith.md");

    const hadTraeMcp = existsSync(traeMcpPath);
    const existingTrae = safeReadJson(traeMcpPath);
    const traeConfig = buildMcpConfig(existingTrae, mcpEntry);
    ensureDir(dirname(traeMcpPath));
    writeFileSync(traeMcpPath, JSON.stringify(traeConfig, null, 2));
    if (!hadTraeMcp) created.push(traeMcpPath);
    if (copyIfMissing(aiSkillSrc, traeRulesPath)) created.push(traeRulesPath);
  }

  if (targets.has("cursor")) {
    const dest = join(opts.projectPath, ".cursor", "rules", "locksmith.md");
    if (copyIfMissing(aiSkillSrc, dest)) created.push(dest);
  }

  if (targets.has("windsurf")) {
    const dest = join(opts.projectPath, ".windsurf", "rules", "locksmith.md");
    if (copyIfMissing(aiSkillSrc, dest)) created.push(dest);
  }

  if (targets.has("cline")) {
    const dest = join(opts.projectPath, ".clinerules", "locksmith.md");
    if (copyIfMissing(aiSkillSrc, dest)) created.push(dest);
  }

  if (targets.has("copilot")) {
    const dest = join(opts.projectPath, ".github", "copilot-instructions.md");
    if (copyIfMissing(aiSkillSrc, dest)) created.push(dest);
  }

  if (targets.has("agents")) {
    const dest = join(opts.projectPath, "AGENTS.md");
    if (copyIfMissing(aiSkillSrc, dest)) created.push(dest);
  }

  return { created };
}
