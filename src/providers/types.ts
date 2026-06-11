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

export interface ModelInfo {
  name: string;
  isVision: boolean;
  parameterSize?: string;
  family?: string;
  quantization?: string;
}

export interface Provider {
  id: string;
  name: string;
  models: () => Promise<ModelInfo[]>;
  stream: (messages: Message[], model: string, signal?: AbortSignal) => AsyncIterable<StreamChunk>;
}
