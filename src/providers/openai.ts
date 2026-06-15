import type { Provider, Message, ModelInfo } from './types';

export class OpenAIProvider implements Provider {
  id = 'openai';
  name = 'OpenAI';
  
  constructor(private baseUrl: string, private apiKey: string) {
    if (!this.baseUrl.endsWith('/')) {
      this.baseUrl += '/';
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async models(): Promise<ModelInfo[]> {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      if (!res.ok) return [];
      const data = await res.json();
      
      return data.data
        .filter((m: any) => m.id.startsWith('gpt-') || m.id.startsWith('o1-') || m.id.startsWith('o3-'))
        .map((m: any) => ({
          name: m.id,
          isVision: m.id.includes('vision') || m.id === 'gpt-4o' || m.id === 'gpt-4o-mini',
        }))
        .sort((a: ModelInfo, b: ModelInfo) => b.name.localeCompare(a.name)); // Sort descending so newer models are top
    } catch {
      return [];
    }
  }

  async *stream(messages: Message[], model: string, signal?: AbortSignal): AsyncGenerator<string> {
    const res = await fetch(`${this.baseUrl}chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true
      }),
      signal
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch (e) {
              console.warn('OpenAI stream parse error:', e, trimmed);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
