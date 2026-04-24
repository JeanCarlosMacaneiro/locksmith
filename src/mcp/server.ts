import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolDefinition } from "./types";
import { auditTool } from "./tools/audit";
import { fixTool } from "./tools/fix";
import { auditDockerfileTool } from "./tools/audit-dockerfile";
import { fixDockerfileTool } from "./tools/fix-dockerfile";
import { checkOutdatedTool } from "./tools/check-outdated";
import { safeAddTool } from "./tools/safe-add";

const TOOLS: ToolDefinition[] = [
  auditTool,
  fixTool,
  auditDockerfileTool,
  fixDockerfileTool,
  checkOutdatedTool,
  safeAddTool,
];

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "locksmith",
    version: "1.0.0",
  });

  for (const tool of TOOLS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).tool(tool.name, tool.description, tool.inputSchema, tool.handler);
  }

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
