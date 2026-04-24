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
  process.stdout.write(question + " [s/N] ");
  for await (const line of console) {
    return line.trim().toLowerCase() === "s";
  }
  return false;
}

async function runSafeCommand(
  opts: AddOptions,
  command: "add" | "update",
): Promise<void> {
  if (!existsSync(join(opts.projectPath, "package.json"))) {
    console.error(pc.red("✗ No se encontró package.json en el directorio del proyecto."));
    process.exit(1);
  }

  if (!existsSync(join(opts.projectPath, "pnpm-lock.yaml"))) {
    process.stderr.write(pc.yellow("⚠ pnpm-lock.yaml no encontrado. El proyecto puede no tener lockfile.\n"));
  }

  let resolvedVersion: string;
  try {
    resolvedVersion = opts.version ?? (await resolveVersion(opts.package));
  } catch (err) {
    if (err instanceof RegistryError) {
      if (err.code === "not_found") {
        console.error(pc.red(`✗ Paquete no encontrado en el registry: ${opts.package}`));
      } else if (err.code === "timeout") {
        console.error(pc.red(`✗ Timeout al consultar el registry npm (>10s).`));
      } else {
        console.error(pc.red(`✗ Error de red al consultar el registry: ${err.message}`));
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
        console.error(pc.red(`✗ Paquete no encontrado: ${opts.package}@${resolvedVersion}`));
      } else if (err.code === "timeout") {
        console.error(pc.red(`✗ Timeout al obtener package.json del registry.`));
      } else {
        console.error(pc.red(`✗ Error de red: ${err.message}`));
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
    console.error(pc.red("✗ Instalación bloqueada: riesgo crítico (malware) detectado."));
    process.exit(1);
  }

  if (riskLevel === "medium" && !opts.force) {
    const ok = await confirm(pc.yellow("⚠ Se detectaron scripts peligrosos. ¿Desea continuar con la instalación?"));
    if (!ok) {
      console.log(pc.dim("Instalación cancelada por el usuario."));
      process.exit(0);
    }
  }

  if (opts.dryRun) {
    console.log(pc.dim(`\n[dry-run] La instalación no fue ejecutada. Versión analizada: ${resolvedVersion}`));
    process.exit(0);
  }

  try {
    if (command === "add") {
      await installPackage(opts.package, resolvedVersion, opts.projectPath);
    } else {
      await updatePackage(opts.package, resolvedVersion, opts.projectPath);
    }
    console.log(pc.green(`✓ ${opts.package}@${resolvedVersion} instalado correctamente.`));
  } catch (err) {
    console.error(pc.red(`✗ Error al ejecutar pnpm: ${String(err)}`));
    process.exit(1);
  }
}

export async function runSafeAdd(opts: AddOptions): Promise<void> {
  return runSafeCommand(opts, "add");
}

export async function runSafeUpdate(opts: AddOptions): Promise<void> {
  return runSafeCommand(opts, "update");
}
