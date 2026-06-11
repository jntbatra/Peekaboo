import type { Provider, StreamChunk, Message, ModelInfo } from './types';

const DEFAULT_BASE_URL = 'http://localhost:11434';

// Per-model metadata cache: survives the lifetime of the app instance
const metadataCache = new Map<string, { isVision: boolean; parameterSize?: string; family?: string; quantization?: string }>();

// Full model-list TTL cache: keyed by baseUrl, invalidates after 60s
const modelsListCache = new Map<string, { data: ModelInfo[]; fetchedAt: number }>();
const MODELS_CACHE_TTL_MS = 60_000;

export class OllamaProvider implements Provider {
  id = 'ollama';
  name = 'Ollama';
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async *stream(
    messages: Message[],
    model: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const mappedMessages = messages.map((m) => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: m.content };
      }
      let text = '';
      const images: string[] = [];
      for (const part of m.content) {
        if (part.type === 'text' && part.text) {
          text += part.text;
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const match = part.image_url.url.match(/^data:image\/[^;]+;base64,(.+)$/);
          if (match) {
            images.push(match[1]);
          } else {
            images.push(part.image_url.url);
          }
        }
      }
      return {
        role: m.role,
        content: text,
        images: images.length > 0 ? images : undefined,
      };
    });

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ model, messages: mappedMessages, stream: true, keep_alive: "5s" }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Accumulate buffer to handle partial JSON lines across chunks
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          yield {
            delta: json.message?.content ?? '',
            done: json.done ?? false,
          };
        } catch {
          // Skip malformed lines — can happen during high-speed streaming
          console.warn('Peekaboo: skipped malformed Ollama chunk:', trimmed);
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const json = JSON.parse(buffer.trim());
        yield {
          delta: json.message?.content ?? '',
          done: json.done ?? false,
        };
      } catch {
        // Final incomplete chunk — ignore
      }
    }
  }

  async models(): Promise<ModelInfo[]> {
    // Return cached list if within TTL
    const cached = modelsListCache.get(this.baseUrl);
    if (cached && Date.now() - cached.fetchedAt < MODELS_CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      
      const result = await Promise.all(
        (data.models || []).map(async (m: any) => {
          if (metadataCache.has(m.name)) {
            return { name: m.name, ...metadataCache.get(m.name)! };
          }

          let isVision = false;
          const parameterSize = m.details?.parameter_size;
          const family = m.details?.family;
          const quantization = m.details?.quantization_level;

          try {
            const showRes = await fetch(`${this.baseUrl}/api/show`, {
              method: 'POST',
              body: JSON.stringify({ name: m.name }),
              headers: { 'Content-Type': 'application/json' },
            });
            if (showRes.ok) {
              const showData = await showRes.json();
              const families = showData.details?.families || [];
              const capabilities = showData.capabilities || [];
              isVision = families.includes('clip') ||
                         families.includes('mllama') ||
                         families.includes('llava') ||
                         capabilities.includes('vision') ||
                         m.name.toLowerCase().includes('vision') ||
                         m.name.toLowerCase().includes('-vl') ||
                         m.name.toLowerCase().includes('llava');
            }
          } catch {
            // Ignore individual show errors
          }

          const metadata = { isVision, parameterSize, family, quantization };
          metadataCache.set(m.name, metadata);
          return { name: m.name, ...metadata };
        })
      );

      modelsListCache.set(this.baseUrl, { data: result, fetchedAt: Date.now() });
      return result;
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
