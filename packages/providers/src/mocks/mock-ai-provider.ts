import type { AICompletionRequest, AICompletionResult, AIProvider } from "../ai-provider";

export class MockAIProvider implements AIProvider {
  constructor(private readonly fixedResponse: AICompletionResult) {}

  async complete(_request: AICompletionRequest): Promise<AICompletionResult> {
    return this.fixedResponse;
  }
}
