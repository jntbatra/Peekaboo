import type { Provider, StreamChunk, Message } from './types';

const DEFAULT_BASE_URL = 'http://localhost:11434';

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
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ model, messages, stream: true }),
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

  async models(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.models?.map((m: { name: string }) => m.name) ?? [];
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
