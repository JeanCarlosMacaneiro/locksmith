import { bunShell } from "./shell";

export async function installPythonPackage(
  packageName: string,
  version: string,
  projectPath: string,
): Promise<void> {
  await bunShell.$`poetry add ${packageName}@${version}`.cwd(projectPath);
}

export async function updatePythonPackage(
  packageName: string,
  version: string,
  projectPath: string,
): Promise<void> {
  await bunShell.$`poetry add ${packageName}@${version}`.cwd(projectPath);
}
