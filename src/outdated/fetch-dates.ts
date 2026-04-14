// ─── npm registry ─────────────────────────────────────────────────────────────

export async function fetchNpmPublishDate(
  pkg: string,
  version: string
): Promise<Date | null> {
  try {
    const res  = await fetch(`https://registry.npmjs.org/${pkg}`);
    if (!res.ok) return null;
    const data = await res.json() as { time?: Record<string, string> };
    const dateStr = data.time?.[version];
    return dateStr ? new Date(dateStr) : null;
  } catch {
    return null;
  }
}

// ─── PyPI registry ────────────────────────────────────────────────────────────

export async function fetchPypiPublishDate(
  pkg: string,
  version: string
): Promise<Date | null> {
  try {
    const res  = await fetch(`https://pypi.org/pypi/${pkg}/json`);
    if (!res.ok) return null;
    const data = await res.json() as {
      releases?: Record<string, Array<{ upload_time: string }>>
    };
    const files = data.releases?.[version];
    if (!files || files.length === 0) return null;
    const dateStr = files[0]?.upload_time;
    return dateStr ? new Date(dateStr) : null;
  } catch {
    return null;
  }
}
