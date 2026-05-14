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
  if (ageInDays === null) return pc.dim("unknown date");
  return pc.dim(`published ${ageInDays}d ago`);
}

function formatPolicy(pkg: OutdatedPackage): string {
  if (pkg.policyMet === null) {
    return pc.dim(`policy: ${pkg.policyDays}d (unknown date)`);
  }
  if (pkg.policyMet) {
    return pc.green(`✅ policy ok (${pkg.policyDays}d)`);
  }
  const daysLeft = pkg.policyDays - (pkg.ageInDays ?? 0);
  return pc.yellow(`⏳ too recent (${daysLeft}d remaining)`);
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

  console.log(pc.bold("\n📦 Outdated packages\n"));

  if (!policy.hasConfig) {
    console.log(
      pc.yellow("  ⚠  renovate.json not found — using default policy") +
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
      ? "no breaking changes"
      : type === "minor"
      ? "new functionality — review changelog"
      : "possible breaking changes — mandatory review";

    console.log(`  ${label}  ${pc.dim(`— policy: ${pDays}d · ${typeDesc}`)}`);
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
    safe.length    ? pc.green(`${safe.length} patch(es) ready for --fix`)    : "",
    manual.length  ? pc.yellow(`${manual.length} require manual review`)      : "",
    waiting.length ? pc.dim(`${waiting.length} in waiting period`)            : "",
  ].filter(Boolean);

  console.log(`  ${parts.join(pc.dim(" · "))}\n`);

  if (safe.length > 0) {
    console.log(
      pc.dim(`  Safe patches available → run with: `) +
      pc.bold("locksmith . --outdated --fix") + "\n"
    );
  }

  if (waiting.length > 0) {
    console.log(pc.dim("  In waiting period:"));
    for (const pkg of waiting) {
      const daysLeft = pkg.policyDays - (pkg.ageInDays ?? 0);
      console.log(pc.dim(`    ${pkg.name.padEnd(20)} available in ${daysLeft}d`));
    }
    console.log();
  }
}

export function printNoOutdated(): void {
  console.log(pc.green("\n  ✓ All packages are up to date\n"));
}
