import { z } from "zod";

/**
 * Faz 0 için zod kurulumunun çalıştığını gösteren örnek şema. Gerçek action
 * sözleşmeleri `src/actions/*.ts` altında, Jarvis manifestinin (O bölümü)
 * kaynağı olarak sonraki fazlarda eklenir.
 */
export const exampleWorkspaceNameSchema = z.string().min(1).max(120);

export type ExampleWorkspaceName = z.infer<typeof exampleWorkspaceNameSchema>;
