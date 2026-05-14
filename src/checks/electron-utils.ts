import { existsSync, readFileSync } from "fs";
import { join } from "path";

export function findElectronMainFile(projectPath: string): string | null {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const main = pkg.main as string | undefined;
  if (main) {
    const p = join(projectPath, main);
    if (existsSync(p)) return p;
  }
  for (const c of [
    "src/main/index.ts", "src/main/index.js",
    "src/main.ts", "src/main.js",
    "electron/main.ts", "electron/main.js",
    "main.ts", "main.js",
  ]) {
    const p = join(projectPath, c);
    if (existsSync(p)) return p;
  }
  return null;
}
