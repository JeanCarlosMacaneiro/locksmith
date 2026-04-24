import { bunShell } from "./shell";

export async function installPackage(
  packageName: string,
  version: string,
  projectPath: string,
): Promise<void> {
  await bunShell.$`pnpm add ${packageName}@${version} --ignore-scripts`.cwd(projectPath);
}

export async function updatePackage(
  packageName: string,
  version: string,
  projectPath: string,
): Promise<void> {
  await bunShell.$`pnpm update ${packageName}@${version} --ignore-scripts`.cwd(projectPath);
}
