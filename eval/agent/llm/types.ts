export type ProviderId = "groq" | "gemini";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ChatCompletion = {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

export type LlmClient = {
  chat: {
    completions: {
      create(body: {
        model: string;
        messages: ChatMessage[];
        tools?: ChatTool[];
        tool_choice?: "auto" | "none";
        temperature?: number;
      }): Promise<ChatCompletion>;
    };
  };
};

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  apiKey: string;
  baseURL: string;
  model: string;
  tpmLimit: number;
};
