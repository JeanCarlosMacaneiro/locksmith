import { readFileSync } from "fs";
import type { CheckResult } from "../types";
import { findElectronMainFile } from "./electron-utils";

export async function checkElectronNodeIntegration(projectPath: string): Promise<CheckResult> {
  const mainFile = findElectronMainFile(projectPath);

  if (!mainFile) {
    return {
      name: "electron-node-integration",
      status: "warn",
      message: "Electron main file not found to verify nodeIntegration",
    };
  }

  const content = readFileSync(mainFile, "utf-8");

  if (/nodeIntegration\s*:\s*true/.test(content)) {
    return {
      name: "electron-node-integration",
      status: "error",
      message: "nodeIntegration: true — renderer has direct access to Node.js (RCE risk)",
      fixable: false,
      hint: [
        "Set nodeIntegration: false in BrowserWindow webPreferences",
        "Use contextIsolation: true and preload scripts to expose APIs safely",
        "Never expose ipcRenderer directly — use contextBridge.exposeInMainWorld",
      ],
    };
  }

  if (/contextIsolation\s*:\s*false/.test(content)) {
    return {
      name: "electron-node-integration",
      status: "error",
      message: "contextIsolation: false — renderer shares context with Node.js",
      fixable: false,
      hint: ["Set contextIsolation: true in BrowserWindow webPreferences"],
    };
  }

  return {
    name: "electron-node-integration",
    status: "ok",
    message: "nodeIntegration disabled, contextIsolation enabled",
  };
}
