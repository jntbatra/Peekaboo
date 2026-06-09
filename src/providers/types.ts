// Provider interface — thin abstraction for future multi-provider support

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string }; // base64 data URI
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

export interface Provider {
  id: string;
  name: string;
  models: () => Promise<string[]>;
  stream: (messages: Message[], model: string, signal?: AbortSignal) => AsyncIterable<StreamChunk>;
}
