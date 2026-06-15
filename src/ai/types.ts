export type ChatRole = 'system' | 'user' | 'assistant';

export type TextContentPart = {
  type: 'text';
  text: string;
};

export type ImageContentPart = {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
};

export type ContentPart = TextContentPart | ImageContentPart;

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[];
}
