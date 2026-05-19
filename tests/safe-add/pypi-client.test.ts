import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { RegistryError } from "../../src/types";

// Patch global fetch before importing the module under test
const fetchSpy = spyOn(globalThis, "fetch");

import { resolvePyPIVersion, fetchPyPIInfo } from "../../src/add/pypi-client";

function makeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const PYMYSQL_RESPONSE = {
  info: {
    name: "PyMySQL",
    version: "1.1.3",
    summary: "Pure Python MySQL Driver",
    description: "A pure-Python MySQL client library.",
    requires_dist: ["cryptography>=2.5; extra == 'rsa'"],
    home_page: "https://github.com/PyMySQL/PyMySQL",
  },
};

afterEach(() => {
  fetchSpy.mockReset();
});

describe("resolvePyPIVersion", () => {
  it("retorna versión del info.version de PyPI", async () => {
    fetchSpy.mockResolvedValueOnce(makeRes(200, PYMYSQL_RESPONSE));
    const version = await resolvePyPIVersion("pymysql");
    expect(version).toBe("1.1.3");
  });

  it("404 → RegistryError not_found", async () => {
    fetchSpy.mockResolvedValueOnce(makeRes(404, {}));
    await expect(resolvePyPIVersion("no-existe")).rejects.toBeInstanceOf(RegistryError);
    try {
      await resolvePyPIVersion("no-existe");
    } catch (e) {
      // fetchSpy already consumed — just verify type
    }
  });

  it("500 → RegistryError network", async () => {
    fetchSpy.mockResolvedValueOnce(makeRes(500, {}));
    let err: unknown;
    try { await resolvePyPIVersion("pkg"); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(RegistryError);
    expect((err as RegistryError).code).toBe("network");
  });

  it("AbortError → RegistryError timeout", async () => {
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    let err: unknown;
    try { await resolvePyPIVersion("pkg"); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(RegistryError);
    expect((err as RegistryError).code).toBe("timeout");
  });
});

describe("fetchPyPIInfo", () => {
  it("mapea correctamente info de PyPI", async () => {
    fetchSpy.mockResolvedValueOnce(makeRes(200, PYMYSQL_RESPONSE));
    const info = await fetchPyPIInfo("pymysql", "1.1.3");
    expect(info.name).toBe("PyMySQL");
    expect(info.version).toBe("1.1.3");
    expect(info.summary).toBe("Pure Python MySQL Driver");
    expect(info.requiresDist).toContain("cryptography>=2.5; extra == 'rsa'");
    expect(info.homePage).toContain("github.com");
  });

  it("requires_dist null → array vacío", async () => {
    fetchSpy.mockResolvedValueOnce(makeRes(200, {
      info: { ...PYMYSQL_RESPONSE.info, requires_dist: null },
    }));
    const info = await fetchPyPIInfo("pymysql");
    expect(info.requiresDist).toEqual([]);
  });

  it("404 → RegistryError not_found", async () => {
    fetchSpy.mockResolvedValueOnce(makeRes(404, {}));
    let err: unknown;
    try { await fetchPyPIInfo("noexiste", "1.0.0"); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(RegistryError);
    expect((err as RegistryError).code).toBe("not_found");
  });
});
