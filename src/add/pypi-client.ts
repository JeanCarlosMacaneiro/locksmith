import { RegistryError } from "../types";

const PYPI_REGISTRY = "https://pypi.org/pypi";
const TIMEOUT_MS = 10_000;

export interface PyPIInfo {
  name: string;
  version: string;
  summary: string;
  description: string;
  requiresDist: string[];
  homePage: string;
}

interface PyPIApiResponse {
  info: {
    name: string;
    version: string;
    summary: string;
    description: string;
    requires_dist: string[] | null;
    home_page: string;
  };
}

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

async function fetchPyPI(url: string, label: string): Promise<PyPIApiResponse> {
  const res = await fetchWithTimeout(url);
  if (res.status === 404) {
    throw new RegistryError(`Package not found: ${label}`, "not_found");
  }
  if (!res.ok) {
    throw new RegistryError(`Registry error ${res.status} for ${label}`, "network");
  }
  return (await res.json()) as PyPIApiResponse;
}

export async function resolvePyPIVersion(packageName: string): Promise<string> {
  const data = await fetchPyPI(
    `${PYPI_REGISTRY}/${encodeURIComponent(packageName)}/json`,
    packageName,
  );
  return data.info.version;
}

export async function fetchPyPIInfo(packageName: string, version?: string): Promise<PyPIInfo> {
  const url = version
    ? `${PYPI_REGISTRY}/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}/json`
    : `${PYPI_REGISTRY}/${encodeURIComponent(packageName)}/json`;
  const data = await fetchPyPI(url, version ? `${packageName}@${version}` : packageName);
  const { info } = data;
  return {
    name: info.name,
    version: info.version,
    summary: info.summary ?? "",
    description: info.description ?? "",
    requiresDist: info.requires_dist ?? [],
    homePage: info.home_page ?? "",
  };
}
