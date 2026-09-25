export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIPromptRequest {
  operation: string;
  promptVersion: number;
  system: string;
  messages: AIMessage[];
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  temperature: number;
}

export interface ServicePackageInfo {
  id: string;
  name: string;
  summary: string;
  priceMin: number | null;
  priceMax: number | null;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
}

export interface SalesRules {
  allowDiscountMention: boolean;
  forbiddenWords: string[];
}

export type OutreachChannel = "EMAIL" | "INSTAGRAM" | "FACEBOOK" | "WHATSAPP" | "LINKEDIN" | "TIKTOK";
