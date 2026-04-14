#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runAllChecks } from "../src/checks/index";
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
      const opts: RunOptions = {
        projectPath: argv.path as string,
        fix: argv.fix,
        report: argv.report as "json" | "markdown" | undefined,
        strict: argv.strict,
        outdated: argv.outdated,
      };
      await runAllChecks(opts);
    }
  )
  .help()
  .alias("h", "help")
  .version()
  .alias("v", "version")
  .parse();
