export type Attachment = {
  id?: string;
  filename: string;
  content_type?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
};

export type MessageAttachment = {
  id: string;
  filename: string;
  content_type?: string;
};

export type Message = {
  role: "user" | "assistant";
  content: string;
  attachments?: MessageAttachment[];
};

export type Model = {
  id: string;
  name: string;
  category: string;
  description: string;
};

export type Conversation = {
  id: string;
  title: string;
  pinned: boolean;
  updated_at?: string;
};

export type ConversationTurn = {
  id: string;
  turnNumber: number;
  totalTurns: number;
  userMessage: Message;
  assistantMessage?: Message;
  isGenerating?: boolean;
};
