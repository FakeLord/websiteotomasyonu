export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  model: string;
  system: string;
  messages: AIMessage[];
  jsonSchema?: Record<string, unknown>;
  maxTokens: number;
  temperature: number;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AICompletionResult {
  text: string;
  json?: unknown;
  usage: AIUsage;
  latencyMs: number;
}

/**
 * OpenAI-uyumlu sağlayıcı sözleşmesi (SPEC.md → J.1). Somut implementasyonlar
 * (NVIDIA, Ollama) ileriki fazlarda `OpenAICompatibleProvider` olarak eklenir.
 */
export interface AIProvider {
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
}
