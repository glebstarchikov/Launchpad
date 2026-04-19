import type { Database } from "bun:sqlite";
import { z, type ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { db as defaultDb } from "../db/index.ts";
import * as tools from "./mcp-tools.ts";
import { McpToolError } from "./mcp-tools.ts";

const SERVER_NAME = "launchpad";
const SERVER_VERSION = "0.1.0";
const PROTOCOL_VERSION = "2024-11-05";

export interface McpRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  // args is typed `any` because each tool has a different Zod-derived shape;
  // dispatchMcpRequest always calls this with `parsed.data` from the tool's own inputSchema.safeParse().
  handler: (args: any, userId: string, db: Database) => unknown | Promise<unknown>;
}

const projectIdParam = { project_id: z.string().min(1) };

const toolDefs: ToolDef[] = [
  {
    name: "list_projects",
    description: "List all your projects with id, name, stage, and url.",
    inputSchema: z.object({}).strict(),
    handler: (_args, userId, db) => tools.listProjects(userId, db),
  },
  {
    name: "get_project_overview",
    description: "Get a compact LLM-ready markdown overview of a project: metadata, counts (tech debt, checklist, legal, goals), last 3 build log entries, and site health.",
    inputSchema: z.object(projectIdParam).strict(),
    handler: ({ project_id }, userId, db) => tools.getProjectOverviewText(userId, project_id, db),
  },
  {
    name: "get_build_log",
    description: "Get the full build log of a project. Default 50 newest entries; max 500. Optional source filter ('user' or 'ai').",
    inputSchema: z.object({
      ...projectIdParam,
      limit: z.number().int().positive().optional(),
      source: z.enum(["user", "ai"]).optional(),
    }).strict(),
    handler: ({ project_id, limit, source }, userId, db) =>
      tools.getBuildLog(userId, project_id, { limit, source }, db),
  },
  {
    name: "get_tech_debt",
    description: "List tech debt items for a project. Default returns open items. Pass status='resolved' for resolved only, 'all' for both.",
    inputSchema: z.object({
      ...projectIdParam,
      status: z.enum(["open", "resolved", "all"]).optional(),
      limit: z.number().int().positive().optional(),
    }).strict(),
    handler: ({ project_id, status, limit }, userId, db) =>
      tools.getTechDebt(userId, project_id, { status, limit }, db),
  },
  {
    name: "get_checklist",
    description: "Return the launch checklist items (pending and completed) for a project.",
    inputSchema: z.object(projectIdParam).strict(),
    handler: ({ project_id }, userId, db) => tools.getChecklist(userId, project_id, db),
  },
  {
    name: "get_legal",
    description: "Return legal compliance items for a project, grouped by country code.",
    inputSchema: z.object(projectIdParam).strict(),
    handler: ({ project_id }, userId, db) => tools.getLegal(userId, project_id, db),
  },
  {
    name: "get_goals",
    description: "Return active and completed goals for a project with current and target values.",
    inputSchema: z.object(projectIdParam).strict(),
    handler: ({ project_id }, userId, db) => tools.getGoals(userId, project_id, db),
  },
  {
    name: "get_mrr",
    description: "Return MRR history data points for a project. Optional months filter (e.g. 3 = last 3 months).",
    inputSchema: z.object({
      ...projectIdParam,
      months: z.number().int().positive().optional(),
    }).strict(),
    handler: ({ project_id, months }, userId, db) =>
      tools.getMrr(userId, project_id, { months }, db),
  },
  {
    name: "get_github_commits",
    description: "Fetch recent GitHub commits for a project's wired repo. Optional ISO-8601 'since' timestamp (default: 14 days ago). Returns empty array if the project has no github_repo.",
    inputSchema: z.object({
      ...projectIdParam,
      since: z.string().optional(),
    }).strict(),
    handler: ({ project_id, since }, userId, db) =>
      tools.getGithubCommits(userId, project_id, { since }, db),
  },
  {
    name: "get_site_health",
    description: "Return the latest site monitoring status for a project (up, down, or unknown) with last check timestamp and error if any.",
    inputSchema: z.object(projectIdParam).strict(),
    handler: ({ project_id }, userId, db) => tools.getSiteHealth(userId, project_id, db),
  },
  {
    name: "append_build_log",
    description: "Append a new entry to a project's build log. The entry is attributed to the AI (source='ai') — it will appear with an 'AI' pill in the UI.",
    inputSchema: z.object({
      ...projectIdParam,
      content: z.string().min(1),
    }).strict(),
    handler: ({ project_id, content }, userId, db) =>
      tools.appendBuildLog(userId, project_id, content, db),
  },
  {
    name: "add_tech_debt",
    description: "Record a new technical-debt item on a project. Optional severity (low/medium/high), category, and effort fields. This action also appends an 'AI added tech debt: <note>' entry to the build log in the same transaction.",
    inputSchema: z.object({
      ...projectIdParam,
      note: z.string().min(1),
      severity: z.string().optional(),
      category: z.string().optional(),
      effort: z.string().optional(),
    }).strict(),
    handler: ({ project_id, note, severity, category, effort }, userId, db) =>
      tools.addTechDebt(userId, project_id, note, { severity, category, effort }, db),
  },
];

const toolMap = new Map(toolDefs.map((t) => [t.name, t]));
if (toolMap.size !== toolDefs.length) {
  throw new Error("mcp-protocol: duplicate tool name detected in toolDefs");
}

function errorResponse(id: McpRequest["id"], code: number, message: string): McpResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function dispatchMcpRequest(
  req: McpRequest,
  userId: string,
  database: Database = defaultDb,
): Promise<McpResponse> {
  if (req?.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return errorResponse(req?.id ?? null, -32600, "invalid request");
  }

  if (req.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: req.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        capabilities: { tools: {} },
      },
    };
  }

  if (req.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: req.id,
      result: {
        tools: toolDefs.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: zodToJsonSchema(t.inputSchema, { target: "jsonSchema7" }),
        })),
      },
    };
  }

  if (req.method === "tools/call") {
    const params = req.params as { name?: unknown; arguments?: unknown } | undefined;
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (typeof name !== "string") return errorResponse(req.id, -32602, "tools/call requires a tool name");
    const tool = toolMap.get(name);
    if (!tool) return errorResponse(req.id, -32602, `tool not found: ${name}`);

    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      return errorResponse(
        req.id,
        -32602,
        `invalid params: ${parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => i.path.join(".") + ": " + i.message).join("; ")}`,
      );
    }

    try {
      const result = await tool.handler(parsed.data, userId, database);
      const text = typeof result === "string" ? result : JSON.stringify(result);
      return { jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text }] } };
    } catch (err: any) {
      if (err instanceof McpToolError) {
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: { isError: true, content: [{ type: "text", text: err.message }] },
        };
      }
      console.error(`[mcp] internal error in tool '${name}':`, err);
      return errorResponse(req.id, -32603, "internal error");
    }
  }

  return errorResponse(req.id, -32601, `method not found: ${req.method}`);
}
