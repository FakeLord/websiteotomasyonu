import type { AIPromptRequest } from "@lbf/core";
import { supabase } from "./supabase-client";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CallAiGatewayResult {
  json: unknown;
  cached: boolean;
}

/**
 * `ai-gateway` Edge Function'ını çağırır ve `(operation, girdi, promptVersion)`
 * hash'ini istemcide hesaplar (SPEC.md → J.4: 24 saatlik cache). Prompt metni
 * hiçbir zaman `ai_runs`'a yazılmaz — yalnızca bu çağrının kendisi loglanır.
 */
export async function callAiGateway(
  workspaceId: string,
  request: AIPromptRequest,
  entity?: { entityType: string; entityId: string },
): Promise<CallAiGatewayResult> {
  const inputHash = await sha256Hex(JSON.stringify({ system: request.system, messages: request.messages }));

  const { data, error } = await supabase.functions.invoke("ai-gateway", {
    body: {
      workspaceId,
      request,
      inputHash,
      entityType: entity?.entityType,
      entityId: entity?.entityId,
    },
  });
  if (error) throw error;

  return { json: data.json, cached: !!data.cached };
}
