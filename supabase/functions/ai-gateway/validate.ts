export interface AIPromptRequestBody {
  operation: string;
  promptVersion: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  temperature: number;
}

export interface RequestBody {
  workspaceId: string;
  request: AIPromptRequestBody;
  inputHash: string;
  entityType?: string;
  entityId?: string;
}

export function isValidBody(value: unknown): value is RequestBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  if (typeof body.workspaceId !== "string" || body.workspaceId.length === 0) return false;
  if (typeof body.inputHash !== "string" || body.inputHash.length === 0) return false;
  const req = body.request as Record<string, unknown> | undefined;
  if (!req || typeof req.operation !== "string" || typeof req.promptVersion !== "number") return false;
  if (typeof req.system !== "string" || !Array.isArray(req.messages)) return false;
  return true;
}
