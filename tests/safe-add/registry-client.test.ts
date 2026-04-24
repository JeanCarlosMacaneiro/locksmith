import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { RegistryError } from "../../src/types";

// Capture the global fetch before any mocking
const originalFetch = globalThis.fetch;

function mockFetch(impl: typeof fetch): void {
  globalThis.fetch = impl;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

beforeEach(() => {});
afterEach(() => restoreFetch());

// Import after describing mocks so we can swap fetch
async function getClient() {
  // Re-import to get fresh module state. Bun caches modules so we import once.
  return import("../../src/add/registry-client");
}

describe("resolveVersion", () => {
  it("respuesta 200 → retorna versión", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ version: "3.2.1" }), { status: 200 })
    );
    const { resolveVersion } = await getClient();
    const v = await resolveVersion("express");
    expect(v).toBe("3.2.1");
  });

  it("respuesta 404 → lanza RegistryError not_found", async () => {
    mockFetch(async () => new Response("Not Found", { status: 404 }));
    const { resolveVersion } = await getClient();
    await expect(resolveVersion("no-such-pkg-xyz")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("error de red → lanza RegistryError network", async () => {
    mockFetch(async () => { throw new TypeError("Failed to fetch"); });
    const { resolveVersion } = await getClient();
    await expect(resolveVersion("pkg")).rejects.toMatchObject({
      code: "network",
    });
  });

  it("abort → lanza RegistryError timeout", async () => {
    mockFetch(async (_url, opts) => {
      return new Promise((_res, rej) => {
        (opts?.signal as AbortSignal | undefined)?.addEventListener("abort", () => {
          const err = new Error("AbortError");
          err.name = "AbortError";
          rej(err);
        });
      });
    });
    // We can't easily trigger a real 10s timeout in tests, so verify the error type mapping works
    // by simulating an AbortError directly
    const { resolveVersion } = await getClient();
    mockFetch(async () => {
      const err = new Error("This was aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(resolveVersion("pkg")).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("fetchPackageJson", () => {
  it("respuesta 200 → retorna objeto", async () => {
    const payload = { name: "express", version: "4.0.0", scripts: {} };
    mockFetch(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const { fetchPackageJson } = await getClient();
    const result = await fetchPackageJson("express", "4.0.0");
    expect(result.name).toBe("express");
    expect(result.version).toBe("4.0.0");
  });

  it("respuesta 404 → lanza RegistryError not_found", async () => {
    mockFetch(async () => new Response("Not Found", { status: 404 }));
    const { fetchPackageJson } = await getClient();
    await expect(fetchPackageJson("no-such", "1.0.0")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("instancia correcta de RegistryError", async () => {
    mockFetch(async () => new Response("Not Found", { status: 404 }));
    const { fetchPackageJson } = await getClient();
    let err: unknown;
    try {
      await fetchPackageJson("bad-pkg", "1.0.0");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RegistryError);
    expect((err as RegistryError).code).toBe("not_found");
  });
});
