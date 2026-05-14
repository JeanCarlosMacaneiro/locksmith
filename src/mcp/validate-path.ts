import { resolve, isAbsolute } from "path";

export function validateProjectPath(raw: string): string {
  if (!isAbsolute(raw)) {
    throw new Error(`projectPath must be absolute, got: ${raw}`);
  }
  return resolve(raw);
}
