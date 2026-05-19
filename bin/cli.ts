#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { join } from "path";
import { runAllChecks } from "../src/checks/index";
import { runSafeAdd, runSafeUpdate } from "../src/add/index";
import { installProjectMcp } from "../src/mcp/project-install";
import type { InstallProjectMcpTarget } from "../src/mcp/project-install";
import type { RunOptions } from "../src/types";

async function runPolicyConfig(projectPath: string): Promise<void> {
  const { createInterface } = await import("readline");
  const { readRenovatePolicy } = await import("../src/outdated/classify");
  const { writeLocksmithPolicy } = await import("../src/config/policy");

  const current = readRenovatePolicy(projectPath);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log("\nLocksmith — Outdated Policy\n");

  const fields = [
    { key: "major" as const, label: "major          " },
    { key: "minor" as const, label: "minor          " },
    { key: "patch" as const, label: "patch (not met)" },
  ];

  const updates: Partial<{ major: number; minor: number; patch: number }> = {};

  for (const { key, label } of fields) {
    const cur = current[key];
    const raw = await ask(`  ${label}  [${cur}d] → `);
    const n = parseInt(raw.trim());
    if (!Number.isNaN(n) && n > 0) updates[key] = n;
  }

  const patchVal = updates.patch ?? current.patch;
  console.log(`  patch (met)     [${patchVal}d]   (same threshold — safe to auto-fix when met)\n`);

  rl.close();

  if (Object.keys(updates).length === 0) {
    console.log("  No changes made.\n");
    return;
  }

  writeLocksmithPolicy(projectPath, updates);
  console.log(`  ✓ Saved to ${projectPath}/.locksmith.json\n`);
}

function parseInstallMcpClients(raw: unknown): InstallProjectMcpTarget[] | null {
  if (typeof raw !== "string") return null;
  const allowed: InstallProjectMcpTarget[] = ["trae", "cursor", "windsurf", "cline", "copilot", "agents", "claude"];
  const set = new Set<InstallProjectMcpTarget>();
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if ((allowed as string[]).includes(part)) set.add(part as InstallProjectMcpTarget);
  }
  return [...set];
}

yargs(hideBin(process.argv))
  .scriptName("locksmith")
  .usage("$0 [path] [options]")
  .command(
    "$0 [path]",
    "Audit project security policies",
    (y) =>
      y
        .positional("path", {
          describe: "Project path to audit",
          type: "string",
          default: process.cwd(),
        })
        .option("fix", {
          type: "boolean",
          description: "Apply automatic fixes",
          default: false,
        })
        .option("fix-dockerfile", {
          type: "boolean",
          description: "Analyze and fix project Dockerfile (Node and Python)",
          default: false,
        })
        .option("fix-docker", {
          type: "boolean",
          description: "Alias for --fix-dockerfile",
          default: false,
        })
        .option("report", {
          type: "string",
          choices: ["json", "markdown"] as const,
          description: "Export report in the specified format",
        })
        .option("strict", {
          type: "boolean",
          description: "Exit 1 on warnings",
          default: false,
        })
        .option("outdated", {
          type: "boolean",
          description: "Check outdated packages and validate against Renovate policy",
          default: false,
        })
        .option("install-mcp", {
          type: "boolean",
          description: "Configure per-project MCP integration (IDE-based clients)",
          default: false,
        })
        .option("install-mcp-clients", {
          type: "string",
          description: "CSV list for non-interactive mode: trae,cursor,windsurf,cline,copilot,agents,claude",
        })
        .option("config", {
          type: "boolean",
          description: "Interactively configure outdated policy thresholds (saved to .locksmith.json)",
          default: false,
        }),
    async (argv) => {
      if (argv["install-mcp"] as boolean) {
        const nonInteractiveTargets = parseInstallMcpClients(argv["install-mcp-clients"]);
        const targets: InstallProjectMcpTarget[] = nonInteractiveTargets ??
          (process.stdin.isTTY
            ? (await (await import("../bin/register-mcp")).multiselect([
                "Trae (MCP + rules)",
                "Claude Code (MCP + rules)",
                "Cursor (rules)",
                "Windsurf (rules)",
                "Cline (rules)",
                "GitHub Copilot (rules)",
                "AGENTS.md (rules)",
              ])).map((i) => ["trae", "claude", "cursor", "windsurf", "cline", "copilot", "agents"][i] as InstallProjectMcpTarget)
            : ["trae", "claude", "cursor", "windsurf", "cline", "copilot", "agents"]);

        if (targets.length === 0) {
          console.log("⚠ No clients selected — skipping configuration");
          return;
        }

        const { created } = await installProjectMcp({
          projectPath: argv.path as string,
          locksmithRoot: join(import.meta.dir, ".."),
          targets,
        });
        if (created.length === 0) {
          console.log("✓ Per-project MCP already configured");
        } else {
          console.log("✓ Per-project MCP configured");
          for (const p of created) console.log(`  → ${p}`);
        }
        return;
      }

      if (argv["config"] as boolean) {
        await runPolicyConfig(argv.path as string);
        return;
      }

      const fixDocker = argv["fix-docker"] as boolean;
      const opts: RunOptions = {
        projectPath:   argv.path as string,
        fix:           argv.fix,
        fixDockerfile: (argv["fix-dockerfile"] as boolean) || fixDocker,
        fixDocker,
        report:        argv.report as "json" | "markdown" | undefined,
        strict:        argv.strict,
        outdated:      argv.outdated,
      };
      await runAllChecks(opts);
    }
  )
  .command(
    "register-mcp",
    "Configure MCP server for installed AI clients (global setup)",
    (y) => y,
    async () => {
      const { main } = await import("../bin/register-mcp");
      await main();
    }
  )
  .command(
    "add <package>",
    "Audit and install a package with pnpm",
    (y) =>
      y
        .positional("package", { type: "string", demandOption: true })
        .option("force", { type: "boolean", default: false, description: "Skip confirmation on medium risk" })
        .option("dry-run", { type: "boolean", default: false, description: "Analyze without installing" }),
    async (argv) => {
      const [pkg, version] = (argv.package as string).split("@");
      await runSafeAdd({
        projectPath: process.cwd(),
        package: pkg!,
        version,
        force: argv.force as boolean,
        dryRun: argv["dry-run"] as boolean,
      });
    }
  )
  .command(
    "update <package>",
    "Audit and update a package with pnpm",
    (y) =>
      y
        .positional("package", { type: "string", demandOption: true })
        .option("force", { type: "boolean", default: false, description: "Skip confirmation on medium risk" })
        .option("dry-run", { type: "boolean", default: false, description: "Analyze without updating" }),
    async (argv) => {
      const [pkg, version] = (argv.package as string).split("@");
      await runSafeUpdate({
        projectPath: process.cwd(),
        package: pkg!,
        version,
        force: argv.force as boolean,
        dryRun: argv["dry-run"] as boolean,
      });
    }
  )
  .help()
  .alias("h", "help")
  .version()
  .alias("v", "version")
  .parse();
