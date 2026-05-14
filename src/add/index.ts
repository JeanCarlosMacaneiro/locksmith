import pc from "picocolors";
import { existsSync } from "fs";
import { join } from "path";
import type { AddOptions } from "../types";
import { RegistryError } from "../types";
import { resolveVersion, fetchPackageJson } from "./registry-client";
import { inspectScripts } from "./script-inspector";
import { querySocket } from "./socket-client";
import { determineRiskLevel, printReport } from "./security-report";
import { installPackage, updatePackage } from "./installer";

async function confirm(question: string): Promise<boolean> {
  process.stdout.write(question + " [y/N] ");
  for await (const line of console) {
    return line.trim().toLowerCase() === "y";
  }
  return false;
}

async function runSafeCommand(
  opts: AddOptions,
  command: "add" | "update",
): Promise<void> {
  if (!existsSync(join(opts.projectPath, "package.json"))) {
    console.error(pc.red("✗ package.json not found in the project directory."));
    process.exit(1);
  }

  if (!existsSync(join(opts.projectPath, "pnpm-lock.yaml"))) {
    process.stderr.write(pc.yellow("⚠ pnpm-lock.yaml not found. The project may not have a lockfile.\n"));
  }

  let resolvedVersion: string;
  try {
    resolvedVersion = opts.version ?? (await resolveVersion(opts.package));
  } catch (err) {
    if (err instanceof RegistryError) {
      if (err.code === "not_found") {
        console.error(pc.red(`✗ Package not found in registry: ${opts.package}`));
      } else if (err.code === "timeout") {
        console.error(pc.red(`✗ Timeout querying the npm registry (>10s).`));
      } else {
        console.error(pc.red(`✗ Network error querying the registry: ${err.message}`));
      }
      process.exit(1);
    }
    throw err;
  }

  let pkgJson: Record<string, unknown>;
  try {
    pkgJson = await fetchPackageJson(opts.package, resolvedVersion);
  } catch (err) {
    if (err instanceof RegistryError) {
      if (err.code === "not_found") {
        console.error(pc.red(`✗ Package not found: ${opts.package}@${resolvedVersion}`));
      } else if (err.code === "timeout") {
        console.error(pc.red(`✗ Timeout fetching package.json from registry.`));
      } else {
        console.error(pc.red(`✗ Network error: ${err.message}`));
      }
      process.exit(1);
    }
    throw err;
  }

  const dangerousScripts = inspectScripts(pkgJson);

  const lifecycleScripts: Record<string, string> = {};
  const scripts = pkgJson.scripts;
  if (scripts && typeof scripts === "object" && !Array.isArray(scripts)) {
    for (const key of ["preinstall", "install", "postinstall"] as const) {
      const val = (scripts as Record<string, unknown>)[key];
      if (typeof val === "string") lifecycleScripts[key] = val;
    }
  }

  let socketScore;
  const token = process.env.SOCKET_SECURITY_API_TOKEN;
  if (token && token.trim() !== "") {
    socketScore = (await querySocket(opts.package, resolvedVersion)) ?? undefined;
  }

  const riskLevel = determineRiskLevel(dangerousScripts, socketScore);

  const info = {
    name: opts.package,
    resolvedVersion,
    lifecycleScripts,
    dangerousScripts,
    socketScore,
    riskLevel,
  };

  printReport(info);

  if (riskLevel === "critical") {
    console.error(pc.red("✗ Installation blocked: critical risk (malware) detected."));
    process.exit(1);
  }

  if (riskLevel === "medium" && !opts.force) {
    const ok = await confirm(pc.yellow("⚠ Dangerous scripts detected. Do you want to continue with the installation?"));
    if (!ok) {
      console.log(pc.dim("Installation cancelled by the user."));
      process.exit(0);
    }
  }

  if (opts.dryRun) {
    console.log(pc.dim(`\n[dry-run] Installation was not executed. Analyzed version: ${resolvedVersion}`));
    process.exit(0);
  }

  try {
    if (command === "add") {
      await installPackage(opts.package, resolvedVersion, opts.projectPath);
    } else {
      await updatePackage(opts.package, resolvedVersion, opts.projectPath);
    }
    console.log(pc.green(`✓ ${opts.package}@${resolvedVersion} installed successfully.`));
  } catch (err) {
    console.error(pc.red(`✗ Error running pnpm: ${String(err)}`));
    process.exit(1);
  }
}

export async function runSafeAdd(opts: AddOptions): Promise<void> {
  return runSafeCommand(opts, "add");
}

export async function runSafeUpdate(opts: AddOptions): Promise<void> {
  return runSafeCommand(opts, "update");
}
