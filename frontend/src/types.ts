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
  parent_conversation_id?: string | null;
  parent_turn_index?: number | null;
  context_mode?: "inherit" | "independent";
};

export type ConversationTurn = {
  id: string;
  turnNumber: number;
  totalTurns: number;
  userMessage: Message;
  assistantMessage?: Message;
  isGenerating?: boolean;
};

/** A branch conversation attached to a specific turn of a parent. */
export type BranchConversation = {
  id: string;
  title: string;
  model: string | null;
  pinned: boolean;
  parent_conversation_id: string;
  parent_turn_index: number;
  context_mode: "inherit" | "independent";
  messages: Message[];
  has_children: boolean;
};

/** Maps parentTurnIndex → list of branches */
export type BranchMap = Record<number, BranchConversation[]>;
