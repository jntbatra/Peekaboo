import { useState, useCallback } from 'react';

export type AttachmentType = 'screenshot' | 'clipboard' | 'selection' | 'file';

export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string;       // display name shown on the chip
  content: string;     // base64 for images, plaintext for text
  mediaType: string;   // 'image/png', 'text/plain', etc.
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const add = useCallback((attachment: Omit<Attachment, 'id'>) => {
    const id = crypto.randomUUID();
    setAttachments((prev) => [...prev, { id, ...attachment }]);
    return id;
  }, []);

  const remove = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clear = useCallback(() => {
    setAttachments([]);
  }, []);

  /**
   * Build the content parts array for an Ollama multimodal message.
   * Text content + any image attachments as base64 image_url parts.
   */
  const buildMessageContent = useCallback(
    (text: string) => {
      if (attachments.length === 0) return text;

      const parts: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
        | { type: 'text'; text: string }
      > = [{ type: 'text', text }];

      for (const att of attachments) {
        if (att.mediaType.startsWith('image/')) {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${att.mediaType};base64,${att.content}` },
          });
        } else {
          // Text attachments: prepend as a quoted block
          parts[0] = {
            type: 'text',
            text: `<context>\n${att.content}\n</context>\n\n${text}`,
          };
        }
      }

      return parts;
    },
    [attachments]
  );

  return { attachments, add, remove, clear, buildMessageContent };
}
