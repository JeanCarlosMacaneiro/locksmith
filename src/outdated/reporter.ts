import pc from "picocolors";
import type { OutdatedPackage, RenovatePolicy, UpdateType } from "../types";

// ─── helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<UpdateType, (s: string) => string> = {
  patch: pc.green,
  minor: pc.yellow,
  major: pc.red,
};

const TYPE_LABEL: Record<UpdateType, string> = {
  patch: "PATCH",
  minor: "MINOR",
  major: "MAJOR",
};

function formatAge(ageInDays: number | null): string {
  if (ageInDays === null) return pc.dim("fecha desconocida");
  return pc.dim(`publicado hace ${ageInDays}d`);
}

function formatPolicy(pkg: OutdatedPackage): string {
  if (pkg.policyMet === null) {
    return pc.dim(`política: ${pkg.policyDays}d (fecha desconocida)`);
  }
  if (pkg.policyMet) {
    return pc.green(`✅ política ok (${pkg.policyDays}d)`);
  }
  const daysLeft = pkg.policyDays - (pkg.ageInDays ?? 0);
  return pc.yellow(`⏳ muy reciente (faltan ${daysLeft}d)`);
}

function updateCommand(pkg: OutdatedPackage, isNode: boolean): string {
  if (isNode) {
    return pkg.updateType === "major"
      ? `pnpm add ${pkg.name}@${pkg.latest}`
      : `pnpm update ${pkg.name}`;
  }
  return `poetry update ${pkg.name}`;
}

// ─── main reporter ────────────────────────────────────────────────────────────

export function printOutdatedReport(
  packages: OutdatedPackage[],
  policy: RenovatePolicy,
  isNode: boolean
): void {
  const sep = "─".repeat(72);

  console.log(pc.bold("\n📦 Paquetes desactualizados\n"));

  if (!policy.hasConfig) {
    console.log(
      pc.yellow("  ⚠  renovate.json no encontrado — usando política por defecto") +
      pc.dim(` (patch: ${policy.patch}d · minor: ${policy.minor}d · major: ${policy.major}d)\n`)
    );
  }

  // Group by update type
  for (const type of ["patch", "minor", "major"] as const) {
    const group = packages.filter((p) => p.updateType === type);
    if (group.length === 0) continue;

    const label   = TYPE_COLOR[type](TYPE_LABEL[type]);
    const pDays   = policy[type];
    const typeDesc = type === "patch"
      ? "sin breaking changes"
      : type === "minor"
      ? "nueva funcionalidad — revisar changelog"
      : "breaking changes posibles — revisión obligatoria";

    console.log(`  ${label}  ${pc.dim(`— política: ${pDays}d · ${typeDesc}`)}`);
    console.log(pc.dim("  " + sep));

    const nameW = Math.max(...group.map((p) => p.name.length), 14) + 2;

    for (const pkg of group) {
      const icon    = pkg.policyMet === false ? pc.yellow("⏳") : pkg.policyMet ? pc.green("✓") : pc.dim("?");
      const name    = pkg.name.padEnd(nameW);
      const version = `${pc.dim(pkg.current)} → ${pc.bold(pkg.latest)}`;
      const age     = formatAge(pkg.ageInDays);
      const pol     = formatPolicy(pkg);
      const cmd     = pkg.policyMet !== false
        ? pc.dim(`  $ ${updateCommand(pkg, isNode)}`)
        : "";

      console.log(`  ${icon} ${name}${version.padEnd(30)} ${age.padEnd(28)} ${pol}${cmd}`);
    }

    console.log();
  }

  // ── summary ────────────────────────────────────────────────────────────────
  const safe    = packages.filter((p) => p.safeToUpdate);
  const waiting = packages.filter((p) => p.policyMet === false);
  const manual  = packages.filter((p) => p.updateType !== "patch" && p.policyMet !== false);

  const parts = [
    safe.length    ? pc.green(`${safe.length} patch(es) listos para --fix`)  : "",
    manual.length  ? pc.yellow(`${manual.length} requieren revisión manual`)  : "",
    waiting.length ? pc.dim(`${waiting.length} en período de espera`)         : "",
  ].filter(Boolean);

  console.log(`  ${parts.join(pc.dim(" · "))}\n`);

  if (safe.length > 0) {
    console.log(
      pc.dim(`  Patches seguros disponibles → ejecuta con: `) +
      pc.bold("locksmith . --outdated --fix") + "\n"
    );
  }

  if (waiting.length > 0) {
    console.log(pc.dim("  En período de espera:"));
    for (const pkg of waiting) {
      const daysLeft = pkg.policyDays - (pkg.ageInDays ?? 0);
      console.log(pc.dim(`    ${pkg.name.padEnd(20)} disponible en ${daysLeft}d`));
    }
    console.log();
  }
}

export function printNoOutdated(): void {
  console.log(pc.green("\n  ✓ Todos los paquetes están actualizados\n"));
}
