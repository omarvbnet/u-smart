import { z } from 'zod';
import type { AgentCapability, AgentContext, AgentRiskLevel } from '@/lib/agent/types';

export type ToolResult = {
  ok: boolean;
  message: string;
  data?: unknown;
  needsApproval?: boolean;
  approvalId?: string;
};

export type RegisteredTool = {
  id: string;
  name: string;
  description: string;
  category: string;
  riskLevel: AgentRiskLevel;
  requiresApproval: boolean;
  requiredPermissions: AgentCapability[];
  enabled: boolean;
  version: string;
  timeoutMs: number;
  inputSchema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  execute: (args: {
    input: unknown;
    ctx: AgentContext;
    idempotencyKey?: string;
  }) => Promise<ToolResult>;
};

const registry = new Map<string, RegisteredTool>();

export function registerTool(tool: RegisteredTool): void {
  registry.set(tool.id, tool);
}

export function getTool(id: string): RegisteredTool | undefined {
  return registry.get(id);
}

export function listTools(): RegisteredTool[] {
  return [...registry.values()].filter((t) => t.enabled);
}

export function toolsAsOpenAiFunctions(
  allowedIds?: string[] | null
): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return listTools()
    .filter((t) => !allowedIds || allowedIds.includes(t.id))
    .map((t) => ({
      type: 'function' as const,
      function: {
        name: t.id,
        description: t.description,
        parameters: t.jsonSchema,
      },
    }));
}

export function zodToJsonSchemaRough(schema: z.ZodTypeAny): Record<string, unknown> {
  // Lightweight schema export for tool calling; tools also validate with Zod at runtime.
  const def = schema as z.ZodObject<z.ZodRawShape>;
  if (def && typeof def.shape === 'object') {
    const shape = def.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = { type: guessZodType(val as z.ZodTypeAny), description: key };
      if (!(val as z.ZodOptional<z.ZodTypeAny>).isOptional?.()) {
        // zod 4: check for optional via safe parse of undefined
        const probe = (val as z.ZodTypeAny).safeParse(undefined);
        if (!probe.success) required.push(key);
      }
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }
  return { type: 'object', properties: {}, additionalProperties: true };
}

function guessZodType(schema: z.ZodTypeAny): string {
  const s = String(schema?._def?.type ?? schema?.description ?? '');
  if (/number/i.test(s)) return 'number';
  if (/boolean/i.test(s)) return 'boolean';
  if (/array/i.test(s)) return 'array';
  return 'string';
}
