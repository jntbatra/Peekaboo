import type { Message } from '../providers/types';

/**
 * Extract plain text content from a Message content field.
 * Handles both string (plain or JSON-stringified ContentPart[]) and ContentPart[] formats.
 */
export function getTextContent(content: Message['content']): string {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((p: any) => p.type === 'text' && p.text)
            .map((p: any) => p.text)
            .join('');
        }
      } catch {
        // Not a JSON array, fall through
      }
    }
    return content;
  }
  return content.filter((p) => p.type === 'text' && p.text).map((p) => p.text!).join('');
}

/**
 * Parse a user message string for embedded <context> blocks.
 * Returns the contexts array and the remaining prompt text.
 */
export function parseUserContent(raw: string): { contexts: string[]; prompt: string } {
  const contexts: string[] = [];
  let prompt = raw;
  let startIndex = prompt.indexOf('<context>');

  while (startIndex !== -1) {
    const endIndex = prompt.indexOf('</context>', startIndex + 9);
    if (endIndex !== -1) {
      contexts.push(prompt.substring(startIndex + 9, endIndex).trim());
      prompt = prompt.substring(0, startIndex) + prompt.substring(endIndex + 10);
      startIndex = prompt.indexOf('<context>');
    } else {
      break;
    }
  }

  return { contexts, prompt: prompt.trim() };
}
