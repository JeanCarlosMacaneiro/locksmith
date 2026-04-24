import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { bunShell } from "../../src/add/shell";
import { querySocket } from "../../src/add/socket-client";

type ShellFn = typeof bunShell.$;

let mockOutput = "";
let shouldThrow: Error | null = null;

const mockDollar = ((_strings: TemplateStringsArray, ..._values: unknown[]) => ({
  quiet: () => {
    if (shouldThrow) return Promise.reject(shouldThrow);
    return Promise.resolve({ stdout: Buffer.from(mockOutput), stderr: Buffer.from("") });
  },
})) as unknown as ShellFn;

const originalShell = bunShell.$;

beforeEach(() => {
  mockOutput = "";
  shouldThrow = null;
  bunShell.$ = mockDollar;
});

afterEach(() => {
  bunShell.$ = originalShell;
});

describe("querySocket", () => {
  it("output JSON válido → retorna SocketScore", async () => {
    mockOutput = JSON.stringify({ supplyChainRisk: 0.7, alerts: [{ severity: "high", type: "install-scripts" }] });
    const result = await querySocket("pkg", "1.0.0");
    expect(result).not.toBeNull();
    expect(result!.supplyChainRisk).toBe(0.7);
    expect(result!.alerts[0]!.type).toBe("install-scripts");
  });

  it("alerta de malware presente → alerts contiene malware", async () => {
    mockOutput = JSON.stringify({ supplyChainRisk: 1.0, alerts: [{ severity: "critical", type: "malware" }] });
    const result = await querySocket("evil-pkg", "0.0.1");
    expect(result!.alerts.some((a) => a.type === "malware")).toBe(true);
  });

  it("socket no en PATH → retorna null", async () => {
    shouldThrow = new Error("socket: command not found");
    const spy = spyOn(process.stderr, "write").mockImplementation((() => true) as typeof process.stderr.write);
    const result = await querySocket("pkg", "1.0.0");
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it("JSON inválido → retorna null + warning", async () => {
    mockOutput = "not-json{{{{";
    const spy = spyOn(process.stderr, "write").mockImplementation((() => true) as typeof process.stderr.write);
    const result = await querySocket("pkg", "1.0.0");
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it("output vacío → retorna null", async () => {
    mockOutput = "";
    const spy = spyOn(process.stderr, "write").mockImplementation((() => true) as typeof process.stderr.write);
    const result = await querySocket("pkg", "1.0.0");
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it("sin alerts en output → alerts=[]", async () => {
    mockOutput = JSON.stringify({ supplyChainRisk: 0.3 });
    const result = await querySocket("pkg", "2.0.0");
    expect(result!.alerts).toEqual([]);
  });
});
