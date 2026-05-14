import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";
import { findElectronMainFile } from "./electron-utils";

const CSP_PATTERNS = ["Content-Security-Policy", "onHeadersReceived", "defaultSession"];
const HTML_CANDIDATES = ["index.html", "src/index.html", "public/index.html", "src/renderer/index.html"];

export async function checkElectronCsp(projectPath: string): Promise<CheckResult> {
  const mainFile = findElectronMainFile(projectPath);

  if (!mainFile) {
    return {
      name: "electron-csp",
      status: "warn",
      message: "Electron main file not found to verify CSP",
      hint: ["Configure Content-Security-Policy in the main process via session.defaultSession.webRequest.onHeadersReceived"],
    };
  }

  const mainContent = readFileSync(mainFile, "utf-8");
  if (CSP_PATTERNS.some((p) => mainContent.includes(p))) {
    return { name: "electron-csp", status: "ok", message: "CSP configured in main process" };
  }

  const htmlHasCsp = HTML_CANDIDATES.some((h) => {
    const p = join(projectPath, h);
    return existsSync(p) && readFileSync(p, "utf-8").includes("Content-Security-Policy");
  });

  if (htmlHasCsp) {
    return { name: "electron-csp", status: "ok", message: "CSP configured in renderer HTML" };
  }

  return {
    name: "electron-csp",
    status: "error",
    message: "Content Security Policy (CSP) not configured — allows XSS in the renderer",
    fixable: false,
    hint: [
      "Add in the main process: session.defaultSession.webRequest.onHeadersReceived to inject CSP headers",
      "Or use <meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'\"> in the renderer HTML",
    ],
  };
}
