import type { AIPromptRequest } from "@lbf/core";
import { functionErrorMessage } from "./function-error";
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
// Sunucudaki sağlayıcı zinciri en kötü durumda OpenAI (30 sn) + NVIDIA (90 sn)
// bekler; istemci bundan biraz fazlasını bekleyip açık bir hatayla sonuçlanır
// (kullanıcı arayüzde sonsuza kadar "Oluşturuluyor..." görmemeli).
const REQUEST_TIMEOUT_MS = 150_000;

export async function callAiGateway(
  workspaceId: string,
  request: AIPromptRequest,
  entity?: { entityType: string; entityId: string },
  /** `fresh`: "Yeniden Oluştur" — önbellekteki (belki reddedilmiş/yanlış dildeki) yanıt yerine yeni bir yanıt ister. */
  options?: { fresh?: boolean },
): Promise<CallAiGatewayResult> {
  const inputHash = await sha256Hex(
    JSON.stringify({
      system: request.system,
      messages: request.messages,
      ...(options?.fresh ? { nonce: crypto.randomUUID() } : {}),
    }),
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let data: { json: unknown; cached?: boolean } | null;
  let error: unknown;
  try {
    ({ data, error } = await supabase.functions.invoke("ai-gateway", {
      body: {
        workspaceId,
        request,
        inputHash,
        entityType: entity?.entityType,
        entityId: entity?.entityId,
      },
      signal: controller.signal,
    }));
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("AI sağlayıcıları zaman aşımına uğradı (150 sn içinde yanıt gelmedi).");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  // supabase-js yalnızca "non-2xx status code" der; ağ geçidinin gerçek nedenini ({ message }) gösteririz.
  if (error) throw new Error(await functionErrorMessage(error, "AI isteği başarısız oldu."));
  if (!data) throw new Error("AI sağlayıcısından boş yanıt alındı.");

  return { json: data.json, cached: !!data.cached };
}
