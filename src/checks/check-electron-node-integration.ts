import { readFileSync } from "fs";
import type { CheckResult } from "../types";
import { findElectronMainFile } from "./electron-utils";

export async function checkElectronNodeIntegration(projectPath: string): Promise<CheckResult> {
  const mainFile = findElectronMainFile(projectPath);

  if (!mainFile) {
    return {
      name: "electron-node-integration",
      status: "warn",
      message: "No se encontró el archivo main de Electron para verificar nodeIntegration",
    };
  }

  const content = readFileSync(mainFile, "utf-8");

  if (/nodeIntegration\s*:\s*true/.test(content)) {
    return {
      name: "electron-node-integration",
      status: "error",
      message: "nodeIntegration: true — el renderer tiene acceso directo a Node.js (RCE risk)",
      fixable: false,
      hint: [
        "Cambia nodeIntegration: false en webPreferences de BrowserWindow",
        "Usa contextIsolation: true y preload scripts para exponer APIs de forma segura",
        "Nunca exponer ipcRenderer directamente — usar contextBridge.exposeInMainWorld",
      ],
    };
  }

  if (/contextIsolation\s*:\s*false/.test(content)) {
    return {
      name: "electron-node-integration",
      status: "error",
      message: "contextIsolation: false — el renderer comparte contexto con Node.js",
      fixable: false,
      hint: ["Cambia contextIsolation: true en webPreferences de BrowserWindow"],
    };
  }

  return {
    name: "electron-node-integration",
    status: "ok",
    message: "nodeIntegration deshabilitado, contextIsolation habilitado",
  };
}
