import { $ } from "bun";
import { buildOutdatedPackage, readRenovatePolicy } from "./classify";
import { fetchNpmPublishDate, fetchPypiPublishDate } from "./fetch-dates";
import { printOutdatedReport, printNoOutdated } from "./reporter";
import type { OutdatedPackage, RenovatePolicy } from "../types";

// ─── raw package list per ecosystem ──────────────────────────────────────────

async function getNodeOutdated(
  projectPath: string
): Promise<Array<{ name: string; current: string; latest: string }>> {
  try {
    // pnpm outdated exits with code 1 when packages are outdated — catch stdout
    const text = await $`pnpm outdated --json`
      .cwd(projectPath)
      .text()
      .catch((e: any) => (e.stdout as string) ?? "{}");

    const data = JSON.parse(text || "{}") as Record<
      string,
      { current?: string; latest?: string }
    >;

    return Object.entries(data)
      .map(([name, info]) => ({
        name,
        current: info.current ?? "",
        latest:  info.latest  ?? "",
      }))
      .filter((p) => p.current && p.latest && p.current !== p.latest);
  } catch {
    return [];
  }
}

async function getPythonOutdated(
  projectPath: string
): Promise<Array<{ name: string; current: string; latest: string }>> {
  try {
    const text = await $`poetry show --outdated`
      .cwd(projectPath)
      .text()
      .catch((e: any) => (e.stdout as string) ?? "");

    return text
      .trim()
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          name:    parts[0] ?? "",
          current: parts[1] ?? "",
          latest:  parts[2] ?? "",
        };
      })
      .filter((p) => p.name && p.current && p.latest);
  } catch {
    return [];
  }
}

// ─── safe updater ─────────────────────────────────────────────────────────────

async function applySafeUpdates(
  packages: OutdatedPackage[],
  projectPath: string,
  isNode: boolean
): Promise<void> {
  const names = packages.map((p) => p.name);
  if (isNode) {
    await $`pnpm update ${names}`.cwd(projectPath);
  } else {
    for (const name of names) {
      await $`poetry update ${name} --no-interaction`.cwd(projectPath);
    }
  }
}

// ─── pure data extraction (no printing, no side effects) ─────────────────────

export async function runOutdatedCheck(
  projectPath: string,
  projectType: string
): Promise<{ packages: OutdatedPackage[]; policy: RenovatePolicy }> {
  const isNode = projectType !== "python";
  const policy = readRenovatePolicy(projectPath);

  const rawPackages = isNode
    ? await getNodeOutdated(projectPath)
    : await getPythonOutdated(projectPath);

  if (rawPackages.length === 0) {
    return { packages: [], policy };
  }

  const fetchDate = isNode ? fetchNpmPublishDate : fetchPypiPublishDate;
  const packages = await Promise.all(
    rawPackages.map(async (p) => {
      const date = await fetchDate(p.name, p.latest);
      return buildOutdatedPackage(p.name, p.current, p.latest, date, policy);
    })
  );

  return { packages, policy };
}

// ─── main entry point ─────────────────────────────────────────────────────────

export async function runOutdated(
  projectPath: string,
  projectType: string,
  applyFix: boolean
): Promise<void> {
  const isNode = projectType !== "python";
  const policy = readRenovatePolicy(projectPath);

  const rawPackages = isNode
    ? await getNodeOutdated(projectPath)
    : await getPythonOutdated(projectPath);

  if (rawPackages.length === 0) {
    printNoOutdated();
    return;
  }

  // Fetch publish dates in parallel
  const fetchDate = isNode ? fetchNpmPublishDate : fetchPypiPublishDate;
  const packages  = await Promise.all(
    rawPackages.map(async (p) => {
      const date = await fetchDate(p.name, p.latest);
      return buildOutdatedPackage(p.name, p.current, p.latest, date, policy);
    })
  );

  printOutdatedReport(packages, policy, isNode);

  if (applyFix) {
    const safe = packages.filter((p) => p.safeToUpdate);
    if (safe.length > 0) {
      await applySafeUpdates(safe, projectPath, isNode);
    }
  }
}
