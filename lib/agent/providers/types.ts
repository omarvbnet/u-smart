export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallRequest[];
};

export type ToolCallRequest = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatCompletionResult = {
  content: string | null;
  toolCalls: ToolCallRequest[];
  model: string;
  provider: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export type AIProvider = {
  id: string;
  chat(args: {
    model: string;
    messages: ChatMessage[];
    tools?: Array<{
      type: 'function';
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }>;
    temperature?: number;
  }): Promise<ChatCompletionResult>;
};
