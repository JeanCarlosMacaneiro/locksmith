export function buildMcpConfig(
  existingConfig: Record<string, unknown> | null,
  mcpEntryPath: string
): Record<string, unknown> {
  const base = existingConfig ?? { mcpServers: {} };
  const mcpServers = (base.mcpServers as Record<string, unknown>) ?? {};
  return {
    ...base,
    mcpServers: {
      ...mcpServers,
      locksmith: {
        command: "bun",
        args: [mcpEntryPath],
      },
    },
  };
}

// Zed uses context_servers instead of mcpServers
export function buildZedConfig(
  existingConfig: Record<string, unknown> | null,
  mcpEntryPath: string
): Record<string, unknown> {
  const base = existingConfig ?? {};
  const contextServers = (base.context_servers as Record<string, unknown>) ?? {};
  return {
    ...base,
    context_servers: {
      ...contextServers,
      locksmith: {
        command: {
          path: "bun",
          args: [mcpEntryPath],
        },
      },
    },
  };
}

// Continue.dev uses mcpServers as an array
export function buildContinueConfig(
  existingConfig: Record<string, unknown> | null,
  mcpEntryPath: string
): Record<string, unknown> {
  const base = existingConfig ?? {};
  const servers = (base.mcpServers as Array<Record<string, unknown>>) ?? [];
  const filtered = servers.filter((s) => s.name !== "locksmith");
  return {
    ...base,
    mcpServers: [
      ...filtered,
      { name: "locksmith", command: "bun", args: [mcpEntryPath] },
    ],
  };
}
