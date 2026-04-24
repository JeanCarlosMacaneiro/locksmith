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
