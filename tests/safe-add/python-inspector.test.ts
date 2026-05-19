import { describe, it, expect } from "bun:test";
import { inspectPyPIMetadata, PYTHON_DANGEROUS_PATTERNS } from "../../src/add/python-inspector";

describe("inspectPyPIMetadata", () => {
  it("paquete limpio → sin resultados", () => {
    const result = inspectPyPIMetadata({
      summary: "Pure Python MySQL Driver",
      description: "A pure-Python MySQL client library for Python 3.",
    });
    expect(result).toHaveLength(0);
  });

  it("summary con patrón peligroso → DangerousScript detectado", () => {
    const result = inspectPyPIMetadata({
      summary: "os.system download helper",
      description: "Utility library.",
    });
    expect(result).toHaveLength(1);
    expect(result[0].scriptName).toBe("metadata:summary");
    expect(result[0].patterns).toContain("os.system");
  });

  it("description con subprocess → detectado", () => {
    const result = inspectPyPIMetadata({
      summary: "Benign tool",
      description: "Uses subprocess to run commands internally for processing.",
    });
    expect(result).toHaveLength(1);
    expect(result[0].scriptName).toBe("metadata:description");
    expect(result[0].patterns).toContain("subprocess");
  });

  it("múltiples patrones en mismo campo → todos reportados", () => {
    const result = inspectPyPIMetadata({
      summary: "exec( eval( base64 util",
      description: "",
    });
    expect(result[0].patterns).toContain("exec(");
    expect(result[0].patterns).toContain("eval(");
    expect(result[0].patterns).toContain("base64");
  });

  it("ambos campos con patrones → dos DangerousScript", () => {
    const result = inspectPyPIMetadata({
      summary: "curl downloader",
      description: "Uses wget to fetch resources.",
    });
    expect(result).toHaveLength(2);
  });

  it("summary y description vacíos → sin resultados", () => {
    const result = inspectPyPIMetadata({ summary: "", description: "" });
    expect(result).toHaveLength(0);
  });

  it("obfuscación básica no engana (normalizeScript aplicado)", () => {
    // normalizeScript lower-cases → "curl" detectado incluso em maiúsculo
    const result = inspectPyPIMetadata({
      summary: "CURL downloader",
      description: "",
    });
    expect(result[0].patterns).toContain("curl");
  });

  it("description truncada a 200 chars en value (no en detección)", () => {
    const longDesc = "safe content. " + "a".repeat(500);
    const result = inspectPyPIMetadata({ summary: "", description: longDesc });
    expect(result).toHaveLength(0);
  });

  it("PYTHON_DANGEROUS_PATTERNS exportado y não vacío", () => {
    expect(PYTHON_DANGEROUS_PATTERNS.length).toBeGreaterThan(0);
  });
});
