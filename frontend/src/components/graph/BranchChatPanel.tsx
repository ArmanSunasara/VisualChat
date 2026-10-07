import { useState, useRef, FormEvent } from "react";
import { BranchConversation, Message } from "../../types";
import { Reply } from "../Reply";

interface BranchChatPanelProps {
  branch: BranchConversation;
  modelName: string;
  onClose: () => void;
  onBranchUpdated?: (branch: BranchConversation, newMessages: Message[]) => void;
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

export function BranchChatPanel({
  branch,
  modelName,
  onClose,
  onBranchUpdated,
}: BranchChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(branch.messages || []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationScrollRef = useRef<HTMLDivElement>(null);

  const contextLabel =
    branch.context_mode === "inherit"
      ? "Inherited context from parent"
      : "Independent context";

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    const message = text.trim();
    const assistantIndex = messages.length + 1;
    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ];
    setMessages(newMessages);
    setText("");
    setBusy(true);

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversation_id: branch.id,
          model: branch.model,
          attachment_ids: [],
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error("Could not start the response stream.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const appendToken = (content: string) =>
        setMessages((items) =>
          items.map((item, index) =>
            index === assistantIndex
              ? { ...item, content: item.content + content }
              : item,
          ),
        );

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const packet = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const eventName = packet.match(/^event: (.+)$/m)?.[1];
          const raw = packet.match(/^data: (.+)$/m)?.[1];
          if (!eventName || !raw) continue;
          const payload = JSON.parse(raw);
          if (eventName === "token") appendToken(payload.content);
          if (eventName === "error") throw new Error(payload.detail);
        }
        if (done) break;
      }

      // Notify parent graph to update branch messages
      setMessages((finalMessages) => {
        onBranchUpdated?.(branch, finalMessages);
        return finalMessages;
      });
    } catch (error) {
      setMessages((items) =>
        items.map((item, index) =>
          index === assistantIndex
            ? { ...item, content: item.content || String(error) }
            : item,
        ),
      );
    } finally {
      setBusy(false);
      setTimeout(() => {
        conversationScrollRef.current?.scrollTo({
          top: conversationScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    }
  }

  return (
    <aside className="branch-chat-panel" aria-label="Branch chat">
      <div className="branch-chat-header">
        <div className="branch-chat-title">
          <span className="branch-icon-large">⎇</span>
          <div>
            <strong className="branch-chat-name">
              {branch.title === "Branch" ? "Branch Chat" : branch.title}
            </strong>
            <span className={`branch-ctx-tag ${branch.context_mode}`}>
              {branch.context_mode === "inherit" ? (
                <>🔗 {contextLabel}</>
              ) : (
                <>🔓 {contextLabel}</>
              )}
            </span>
          </div>
        </div>
        <button
          className="branch-chat-close"
          onClick={onClose}
          aria-label="Close branch chat"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      {branch.context_mode === "inherit" && (
        <div className="branch-context-banner">
          <span>📎</span>
          <span>
            This branch inherits conversation history up to Turn #
            {branch.parent_turn_index + 1}. The AI sees that context.
          </span>
        </div>
      )}

      <div className="branch-chat-messages" ref={conversationScrollRef}>
        {messages.length === 0 && (
          <div className="branch-chat-empty">
            <div className="branch-empty-icon">⎇</div>
            <p>
              Start chatting in this branch. 
              {branch.context_mode === "inherit"
                ? " The AI will remember the conversation up to the branch point."
                : " This branch has no prior context – it starts fresh."}
            </p>
          </div>
        )}
        {messages.map((message, index) => (
          <article className={`branch-message ${message.role}`} key={index}>
            <i className="avatar branch-avatar">
              {message.role === "assistant" ? "✦" : "A"}
            </i>
            <div className="branch-message-content">
              <div className="message-meta">
                <small>{message.role}</small>
                {message.role === "assistant" && (
                  <span className="model-name">{modelName}</span>
                )}
              </div>
              {message.role === "assistant" ? (
                message.content ? (
                  <Reply content={message.content} />
                ) : busy && index === messages.length - 1 ? (
                  <p className="thinking">
                    Thinking<span className="thinking-dots" />
                  </p>
                ) : null
              ) : (
                <p className="user-copy">{message.content}</p>
              )}
            </div>
          </article>
        ))}
      </div>

      <form className="branch-chat-form" onSubmit={send}>
        <textarea
          className="branch-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            branch.context_mode === "inherit"
              ? "Continue from the branch point…"
              : "Start an independent conversation…"
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy && text.trim()) {
                e.currentTarget.form?.requestSubmit();
              }
            }
          }}
        />
        <div className="branch-chat-controls">
          <span className="branch-model-label">⎇ {modelName}</span>
          <button
            type="submit"
            className="branch-send-btn"
            disabled={busy || !text.trim()}
          >
            {busy ? "Running…" : "Send ↑"}
          </button>
        </div>
      </form>
    </aside>
  );
}
