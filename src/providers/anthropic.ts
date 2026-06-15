import type { Provider, Message, ModelInfo } from './types';

export class AnthropicProvider implements Provider {
  id = 'anthropic';
  name = 'Anthropic';
  
  constructor(private apiKey: string) {}

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      // Anthropic requires a proxy or native rust call if blocked by CORS,
      // but since Tauri handles fetch natively in v2 if configured, or we can assume it works if we use normal fetch
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        // Send a cheap dummy request to verify key
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hello' }]
        })
      });
      return res.ok || res.status === 400; // 400 usually means bad request but valid auth, 401 means invalid auth
    } catch {
      return false;
    }
  }

  async models(): Promise<ModelInfo[]> {
    // Anthropic does not provide a dynamic models endpoint
    return [
      { name: 'claude-3-5-sonnet-20241022', isVision: true },
      { name: 'claude-3-5-haiku-20241022', isVision: false },
      { name: 'claude-3-opus-20240229', isVision: true },
    ];
  }

  async *stream(messages: Message[], model: string, signal?: AbortSignal): AsyncGenerator<string> {
    // Anthropic API uses a system parameter instead of a 'system' message role
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: anthropicMessages,
        system: systemMessage,
        max_tokens: 4096,
        stream: true
      }),
      signal
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${err}`);
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === 'content_block_delta' && data.delta?.text) {
              yield data.delta.text;
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
