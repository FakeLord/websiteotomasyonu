import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * Edge Function hatalarında sunucunun döndüğü `{ message }` alanını okur;
 * supabase-js varsayılan olarak yalnızca "non-2xx status code" der.
 */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { message?: unknown };
      if (typeof body.message === "string" && body.message.length > 0) return body.message;
    } catch {
      return fallback;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
