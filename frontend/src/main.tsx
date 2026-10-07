import {
  useState,
  useEffect,
  useRef,
  FormEvent,
  ChangeEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Attachment,
  Message,
  Model,
  Conversation,
  BranchConversation,
} from "./types";
import { Reply } from "./components/Reply";
import { ConversationGraph } from "./components/graph/ConversationGraph";
import { BranchChatPanel } from "./components/graph/BranchChatPanel";
// @ts-expect-error CSS is bundled by the frontend build tool.
import "./style.css";
// @ts-expect-error CSS is bundled by the frontend build tool.
import "./empty-chat.css";

const models: Model[] = [
  {
    id: "openai/gpt-oss-20b",
    name: "GPT OSS 20B",
    category: "Everyday",
    description: "Efficient for everyday tasks",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    category: "Coding",
    description: "Best for complex coding and reasoning",
  },
  {
    id: "qwen/qwen3.8-27b",
    name: "Qwen 3.8 27B",
    category: "Coding",
    description: "Strong coding and technical problem solving",
  },
];

// Leave this empty for Vite's local /api proxy. Set VITE_API_BASE_URL when the
// frontend and API are deployed on different domains.
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [conversationTitle, setConversationTitle] = useState<string>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [viewMode, setViewMode] = useState<"chat" | "graph">("chat");
  const [activeBranch, setActiveBranch] = useState<BranchConversation | null>(null);
  const historyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch(apiUrl("/api/conversations"))
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => setConversations(d.conversations));
  }, []);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [conversations]);

  const [text, setText] = useState("");
  const [model, setModel] = useState("openai/gpt-oss-20b");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatMenu, setChatMenu] = useState<string>();
  const [deleteChat, setDeleteChat] = useState<Conversation>();
  const [busy, setBusy] = useState(false);
  const selected = models.find((item) => item.id === model) ?? models[1];
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadMenu, setUploadMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const isInside = (event: PointerEvent, selector: string) =>
      event
        .composedPath()
        .some((node) => node instanceof Element && node.closest(selector));
    const closeMenus = (event: PointerEvent) => {
      if (!isInside(event, ".picker")) setMenuOpen(false);
      if (!isInside(event, ".upload-picker")) setUploadMenu(false);
      if (!isInside(event, ".chat-row")) setChatMenu(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setUploadMenu(false);
        setChatMenu(undefined);
      }
    };
    document.addEventListener("pointerdown", closeMenus, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenus, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function refreshConversations() {
    const response = await fetch(apiUrl("/api/conversations"));
    if (response.ok) {
      const data = await response.json();
      setConversations(data.conversations);
    }
  }

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const response = await fetch(apiUrl("/api/conversations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.detail || "Could not create a chat for this upload.");
    setConversationId(data.id);
    await refreshConversations();
    return data.id;
  }

  async function startNewConversation() {
    if (busy || uploading) return;
    setChatMenu(undefined);
    if (!messages.length) {
      setText("");
      setAttachments([]);
      return;
    }
    setText("");
    setMessages([]);
    setAttachments([]);
    setConversationId(undefined);
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setUploadMenu(false);
    try {
      const id = await ensureConversation();
      for (const file of files) {
        const entry: Attachment = { filename: file.name, status: "uploading" };
        setAttachments((items) => [...items, entry]);
        try {
          const form = new FormData();
          form.append("file", file);
          const response = await fetch(apiUrl(`/api/conversations/${id}/documents`), {
            method: "POST",
            body: form,
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.detail || "Upload failed.");
          setAttachments((items) =>
            items.map((item) =>
              item === entry ? { ...result, status: "ready" } : item,
            ),
          );
        } catch (error) {
          setAttachments((items) =>
            items.map((item) =>
              item === entry
                ? { ...item, status: "error", error: String(error) }
                : item,
            ),
          );
        }
      }
    } catch (error) {
      window.alert(String(error));
    } finally {
      setUploading(false);
    }
  }

  async function togglePin(chat: Conversation) {
    const response = await fetch(apiUrl(`/api/conversations/${chat.id}/pin`), {
      method: "PATCH",
    });
    if (response.ok) await refreshConversations();
    setChatMenu(undefined);
  }

  async function confirmDelete() {
    if (!deleteChat) return;
    const response = await fetch(apiUrl(`/api/conversations/${deleteChat.id}`), {
      method: "DELETE",
    });
    if (response.ok) {
      if (conversationId === deleteChat.id) {
        setConversationId(undefined);
        setMessages([]);
        setAttachments([]);
      }
      await refreshConversations();
    }
    setDeleteChat(undefined);
    setChatMenu(undefined);
  }

  async function openConversation(id: string) {
    const [conversationResponse, documentResponse] = await Promise.all([
      fetch(apiUrl(`/api/conversations/${id}`)),
      fetch(apiUrl(`/api/conversations/${id}/documents`)),
    ]);
    if (!conversationResponse.ok) return;
    const data = await conversationResponse.json();
    setConversationId(data.id);
    setConversationTitle(data.title);
    setActiveBranch(null); // reset branch when opening new conversation
    if (data.model && models.some((item) => item.id === data.model))
      setModel(data.model);
    setMessages(
      data.messages.map((message: Message) => ({
        ...message,
        attachments: message.attachments || [],
      })),
    );
    if (documentResponse.ok) {
      const docs = await documentResponse.json();
      setAttachments(
        docs.documents.map(
          (doc: { id: string; filename: string; content_type: string }) => ({
            ...doc,
            status: "ready" as const,
          }),
        ),
      );
    } else setAttachments([]);
  }

  async function removeAttachment(attachment: Attachment, index: number) {
    if (attachment.id && conversationId) {
      const response = await fetch(
        apiUrl(`/api/conversations/${conversationId}/documents/${attachment.id}`),
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = await response.json();
        window.alert(data.detail || "Could not remove this file.");
        return;
      }
    }
    setAttachments((items) =>
      items.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy || uploading) return;
    const message = text.trim();
    const attachedFiles = attachments
      .filter(
        (item): item is Attachment & { id: string } =>
          item.status === "ready" && Boolean(item.id),
      )
      .map(({ id, filename, content_type }) => ({
        id,
        filename,
        content_type,
      }));
    const assistantIndex = messages.length + 1;
    setMessages((items) => [
      ...items,
      { role: "user", content: message, attachments: attachedFiles },
      { role: "assistant", content: "" },
    ]);
    setText("");
    setBusy(true);
    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
          model,
          attachment_ids: attachedFiles.map((file) => file.id),
        }),
      });
      if (!response.ok || !response.body)
        throw Error("Could not start the response stream.");
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
          if (eventName === "meta" || eventName === "done")
            setConversationId(payload.conversation_id);
          if (eventName === "token") appendToken(payload.content);
          if (eventName === "error") throw Error(payload.detail);
        }
        if (done) break;
      }
      setAttachments((items) =>
        items.filter(
          (item) => !attachedFiles.some((file) => file.id === item.id),
        ),
      );
      refreshConversations();
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
    }
  }

  return (
    <main>
      <aside>
        <div className="sidebar-top">
          <h2>✦ ChatBoard</h2>
        </div>
        <button className="new-conversation" onClick={startNewConversation}>
          ＋ New conversation
        </button>
        <div className="history-label">Your chats</div>
        <nav ref={historyRef} aria-label="Conversation history">
          {conversations.map((chat) => (
            <div
              className={`chat-row${chat.pinned ? " pinned" : ""}${conversationId === chat.id ? " active" : ""}`}
              key={chat.id}
            >
              <button
                className="chat-item"
                aria-current={conversationId === chat.id ? "page" : undefined}
                onClick={() => {
                  setChatMenu(undefined);
                  openConversation(chat.id);
                }}
              >
                <span>{chat.title}</span>
                {chat.pinned && (
                  <span className="pin-mark" aria-label="Pinned">
                    📌
                  </span>
                )}
              </button>
              <button
                className="chat-actions"
                aria-label={`Options for ${chat.title}`}
                aria-expanded={chatMenu === chat.id}
                onClick={() =>
                  setChatMenu(chatMenu === chat.id ? undefined : chat.id)
                }
              >
                ⋮
              </button>
              {chatMenu === chat.id && (
                <div className="chat-menu">
                  <button onClick={() => togglePin(chat)}>
                    {chat.pinned ? "📌  Unpin Chat" : "📌  Pin Chat"}
                  </button>
                  <button
                    className="delete-action"
                    onClick={() => {
                      setDeleteChat(chat);
                      setChatMenu(undefined);
                    }}
                  >
                    🗑️ Delete Chat
                  </button>
                </div>
              )}
            </div>
          ))}
        </nav>
        <footer className="sidebar-footer">
          <span>CB</span>
          <div>
            <strong>ChatBoard</strong>
            <small>Document assistant</small>
          </div>
        </footer>
      </aside>
      <section className={viewMode === "graph" ? "graph-mode" : ""}>
        <header className="workspace-header">
          <div className="workspace-header-left">
            <span>CHATBOARD / WORKSPACE</span>
          </div>

          <div className="workspace-header-center">
            <div
              className="view-mode-switcher"
              role="tablist"
              aria-label="View Mode Switcher"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "chat"}
                className={`view-mode-btn ${viewMode === "chat" ? "active" : ""}`}
                onClick={() => setViewMode("chat")}
                title="Normal Chat View"
              >
                <span className="mode-icon">💬</span>
                <span>Chat</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "graph"}
                className={`view-mode-btn ${viewMode === "graph" ? "active" : ""}`}
                onClick={() => setViewMode("graph")}
                title="Interactive Conversation Graph"
              >
                <span className="mode-icon">☊</span>
                <span>Graph View</span>
              </button>
            </div>
          </div>

          <div className="workspace-header-right">
            <span className="model-badge">{selected.name}</span>
          </div>
        </header>

        {viewMode === "graph" ? (
          <div className="graph-split-wrapper">
            <ConversationGraph
              conversationId={conversationId}
              conversationTitle={conversationTitle}
              messages={messages}
              modelName={selected.name}
              busy={busy}
              onSwitchToChat={() => setViewMode("chat")}
              onOpenBranchChat={(branch) => setActiveBranch(branch)}
            />
            {activeBranch && (
              <BranchChatPanel
                key={activeBranch.id}
                branch={activeBranch}
                modelName={selected.name}
                onClose={() => setActiveBranch(null)}
                onBranchUpdated={(branch, newMessages) => {
                  setActiveBranch((prev) =>
                    prev?.id === branch.id
                      ? { ...prev, messages: newMessages }
                      : prev
                  );
                }}
              />
            )}
          </div>
        ) : (
          <div className="conversation">
            {messages.map((message, index) => (
              <article className={message.role} key={index}>
                <i className="avatar">
                  {message.role === "assistant" ? "✦" : "A"}
                </i>
                <div>
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="message-attachments">
                      {message.attachments.map((file) => (
                        <div className="message-attachment" key={file.id}>
                          <span className="message-file-icon">
                            {file.content_type?.includes("pdf") ? "PDF" : "DOC"}
                          </span>
                          <span>
                            <strong>{file.filename}</strong>
                            <small>
                              {file.content_type
                                ?.split("/")
                                .pop()
                                ?.toUpperCase() || "File"}
                            </small>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="message-meta">
                    <small>{message.role}</small>
                    {message.role === "assistant" && (
                      <span className="model-name">{selected.name}</span>
                    )}
                  </div>
                  {message.role === "assistant" ? (
                    <Reply content={message.content} />
                  ) : (
                    <p className="user-copy">{message.content}</p>
                  )}
                </div>
              </article>
            ))}
            {busy && (
              <article>
                <i className="avatar">✦</i>
                <div>
                  <div className="message-meta">
                    <small>assistant</small>
                    <span className="model-name">{selected.name}</span>
                  </div>
                  <p className="thinking">
                    Thinking
                    <span className="thinking-dots" />
                  </p>
                </div>
              </article>
            )}
          </div>
        )}

        {viewMode === "chat" && (
        <form
          onSubmit={send}
          onKeyDownCapture={(event) => {
            const input = event.target;
            if (
              input instanceof HTMLTextAreaElement &&
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!busy && !uploading && input.value.trim())
                event.currentTarget.requestSubmit();
            }
          }}
        >
          <div className="attachment-strip">
            {attachments.map((attachment, index) => (
              <div
                className={`attachment-card ${attachment.status}`}
                key={`${attachment.filename}-${index}`}
              >
                <span className="file-icon">
                  {attachment.status === "uploading"
                    ? "◌"
                    : attachment.status === "error"
                      ? "!"
                      : "▤"}
                </span>
                <span className="file-meta">
                  <strong title={attachment.filename}>
                    {attachment.filename}
                  </strong>
                  <small>
                    {attachment.status === "uploading"
                      ? "Processing…"
                      : attachment.status === "error"
                        ? attachment.error
                        : "File ready · indexed"}
                  </small>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.filename} from this view`}
                  onClick={() => removeAttachment(attachment, index)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask about your files or anything else…"
          />
          <div className="composer-controls">
            <div className="upload-picker">
              <button
                className="add"
                type="button"
                aria-label="Add files"
                aria-expanded={uploadMenu}
                onClick={() => setUploadMenu((open) => !open)}
              >
                ＋
              </button>
              {uploadMenu && (
                <div className="upload-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadMenu(false);
                      fileInput.current?.click();
                    }}
                  >
                    ▤　Upload files
                  </button>
                  <small>PDF, Word, PowerPoint, CSV · up to 25 MB</small>
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.csv,application/pdf,text/csv"
                hidden
                onChange={uploadFiles}
              />
            </div>
            <span>Chat</span>
            <div className="picker">
              <button
                className="model-trigger"
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {selected.name}
                <small>{selected.category}</small>
                <b>⌄</b>
              </button>
              {menuOpen && (
                <div className="model-menu">
                  {models.map((item) => (
                    <button
                      className="model-option"
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setModel(item.id);
                        setMenuOpen(false);
                      }}
                    >
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.description}</span>
                      </div>
                      {item.id === model && <em>✓</em>}
                    </button>
                  ))}
                  <div className="menu-note">
                    Pick a model based on speed, coding, or writing.
                  </div>
                </div>
              )}
            </div>
            <button className="run" disabled={busy || uploading}>
              {busy ? "Running…" : uploading ? "Indexing…" : "Run prompt ↑"}
            </button>
          </div>
        </form>
        )}
      </section>
      {deleteChat && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteChat(undefined);
          }}
        >
          <div
            className="delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h3 id="delete-title">Delete chat</h3>
            <p>Are you sure you want to delete this chat?</p>
            <div>
              <button
                className="cancel-button"
                onClick={() => setDeleteChat(undefined)}
              >
                Cancel
              </button>
              <button className="confirm-delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
