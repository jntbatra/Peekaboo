import type { Provider, Message, ModelInfo } from './types';

export class GeminiProvider implements Provider {
  id = 'gemini';
  name = 'Google Gemini';
  
  constructor(private apiKey: string) {}

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async models(): Promise<ModelInfo[]> {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
      if (!res.ok) return [];
      
      const data = await res.json();
      return (data.models || [])
        .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => ({
          name: m.name.replace('models/', ''),
          isVision: true, // Most modern Gemini models are multimodal
        }))
        .sort((a: ModelInfo, b: ModelInfo) => b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  }

  async *stream(messages: Message[], model: string, signal?: AbortSignal): AsyncGenerator<string> {
    // Gemini maps roles to 'user' or 'model'. System instructions are passed separately.
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const geminiMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const payload: any = { contents: geminiMessages };
    if (systemMessage) {
      payload.systemInstruction = {
        role: 'user',
        parts: [{ text: systemMessage }]
      };
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${err}`);
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
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              yield text;
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
