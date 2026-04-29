#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runAllChecks } from "../src/checks/index";
import { runSafeAdd, runSafeUpdate } from "../src/add/index";
import type { RunOptions } from "../src/types";

yargs(hideBin(process.argv))
  .scriptName("locksmith")
  .usage("$0 [path] [options]")
  .command(
    "$0 [path]",
    "Analiza políticas de seguridad del proyecto",
    (y) =>
      y
        .positional("path", {
          describe: "Ruta del proyecto a analizar",
          type: "string",
          default: process.cwd(),
        })
        .option("fix", {
          type: "boolean",
          description: "Aplica correcciones automáticas",
          default: false,
        })
        .option("fix-dockerfile", {
          type: "boolean",
          description: "Analiza y corrige Dockerfile del proyecto (Node y Python)",
          default: false,
        })
        .option("fix-docker", {
          type: "boolean",
          description: "Alias de --fix-dockerfile",
          default: false,
        })
        .option("report", {
          type: "string",
          choices: ["json", "markdown"] as const,
          description: "Exporta reporte en el formato indicado",
        })
        .option("strict", {
          type: "boolean",
          description: "Falla con exit 1 si hay advertencias",
          default: false,
        })
        .option("outdated", {
          type: "boolean",
          description: "Verifica paquetes desactualizados y valida contra política de Renovate",
          default: false,
        }),
    async (argv) => {
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
    "add <package>",
    "Verifica seguridad e instala un paquete con pnpm",
    (y) =>
      y
        .positional("package", { type: "string", demandOption: true })
        .option("force", { type: "boolean", default: false, description: "Omite confirmación en riesgo medio" })
        .option("dry-run", { type: "boolean", default: false, description: "Analiza sin instalar" }),
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
    "Verifica seguridad y actualiza un paquete con pnpm",
    (y) =>
      y
        .positional("package", { type: "string", demandOption: true })
        .option("force", { type: "boolean", default: false, description: "Omite confirmación en riesgo medio" })
        .option("dry-run", { type: "boolean", default: false, description: "Analiza sin actualizar" }),
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
