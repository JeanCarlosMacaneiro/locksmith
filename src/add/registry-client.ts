import { RegistryError } from "../types";

const REGISTRY = "https://registry.npmjs.org";
const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new RegistryError(`Registry timeout after ${TIMEOUT_MS}ms: ${url}`, "timeout");
    }
    throw new RegistryError(`Network error fetching ${url}: ${String(err)}`, "network");
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveVersion(packageName: string): Promise<string> {
  const url = `${REGISTRY}/${encodeURIComponent(packageName)}/latest`;
  const res = await fetchWithTimeout(url);
  if (res.status === 404) {
    throw new RegistryError(`Package not found: ${packageName}`, "not_found");
  }
  if (!res.ok) {
    throw new RegistryError(`Registry error ${res.status} for ${packageName}`, "network");
  }
  const data = (await res.json()) as Record<string, unknown>;
  return data.version as string;
}

export async function fetchPackageJson(
  packageName: string,
  version: string,
): Promise<Record<string, unknown>> {
  const url = `${REGISTRY}/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`;
  const res = await fetchWithTimeout(url);
  if (res.status === 404) {
    throw new RegistryError(`Package not found: ${packageName}@${version}`, "not_found");
  }
  if (!res.ok) {
    throw new RegistryError(`Registry error ${res.status} for ${packageName}@${version}`, "network");
  }
  return (await res.json()) as Record<string, unknown>;
}
