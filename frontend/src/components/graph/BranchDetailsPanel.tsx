import { useEffect, useState } from "react";
import { BranchConversation, Message } from "../../types";
import { Reply } from "../Reply";
import { convertMessagesToTurns } from "./ConversationGraph";
import { authFetch, apiUrl } from "../../api";

interface BranchDetailsPanelProps {
  branch: BranchConversation;
  modelName: string;
  onClose: () => void;
  onOpenBranchChat?: (branch: BranchConversation) => void;
}

export function BranchDetailsPanel({
  branch,
  modelName,
  onClose,
  onOpenBranchChat,
}: BranchDetailsPanelProps) {
  const [branchData, setBranchData] = useState<BranchConversation>(branch);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Sync prop changes and fetch latest branch messages
  useEffect(() => {
    setBranchData(branch);

    async function fetchLatestMessages() {
      try {
        const resp = await authFetch(apiUrl(`/api/conversations/${branch.id}`));
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.messages) {
          setBranchData((prev) => ({
            ...prev,
            title: data.title || prev.title,
            messages: data.messages.map((m: Message) => ({
              ...m,
              attachments: m.attachments || [],
            })),
          }));
        }
      } catch {
        // Silently use existing messages
      }
    }

    fetchLatestMessages();
  }, [branch]);

  // Keyboard navigation: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const turns = convertMessagesToTurns(branchData.messages || [], false);
  const parentTurnNumber = branchData.parent_turn_index + 1;

  return (
    <aside className="graph-details-panel branch-details-panel" aria-label="Branch details">
      <div className="details-header">
        <div className="details-header-title">
          <span className="branch-icon-pill">⎇ Subgraph</span>
          <div className="branch-header-meta">
            <h4 className="branch-header-title-text">
              {branchData.title === "Branch"
                ? `Branch from Turn #${parentTurnNumber}`
                : branchData.title}
            </h4>
            <div className="branch-header-badges">
              {branchData.context_mode === "inherit" ? (
                <span className="branch-ctx-badge inherit-badge" title="Inherits preceding context">
                  🔗 Inherited Context
                </span>
              ) : (
                <span className="branch-ctx-badge independent-badge" title="Independent context">
                  🔓 Independent
                </span>
              )}
              <span className="details-sub">
                {turns.length} {turns.length === 1 ? "turn" : "turns"}
              </span>
            </div>
          </div>
        </div>
        <div className="details-header-actions">
          <button
            className="details-close-btn"
            onClick={onClose}
            aria-label="Close branch details panel"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="details-content">
        {/* Context info banner */}
        <div className={`details-context-banner ${branchData.context_mode}`}>
          <span className="context-banner-icon">
            {branchData.context_mode === "inherit" ? "🔗" : "🔓"}
          </span>
          <div className="context-banner-text">
            <strong>
              {branchData.context_mode === "inherit"
                ? `Inherits from Main Turn #${parentTurnNumber}`
                : "Independent Subgraph Branch"}
            </strong>
            <p>
              {branchData.context_mode === "inherit"
                ? `This branch diverged from Turn #${parentTurnNumber} of the main conversation and preserves its preceding chat context.`
                : "This branch runs completely independently without carrying forward any previous conversation context."}
            </p>
          </div>
        </div>

        {turns.length === 0 ? (
          <div className="branch-details-empty">
            <div className="empty-subgraph-icon">⎇</div>
            <h4>Empty Subgraph</h4>
            <p>
              No messages have been sent in this branch yet. You can open the branch chat to begin chatting.
            </p>
            {onOpenBranchChat && (
              <button
                className="branch-details-open-chat-btn"
                onClick={() => onOpenBranchChat(branchData)}
              >
                💬 Open Branch Chat
              </button>
            )}
          </div>
        ) : (
          turns.map((turn) => {
            const userAttachments = turn.userMessage.attachments || [];
            return (
              <div key={turn.id} className="branch-details-turn-section">
                <div className="branch-turn-header">
                  <span className="branch-turn-number">Turn #{turn.turnNumber}</span>
                  {turn.totalTurns > 1 && (
                    <span className="branch-turn-total">of {turn.totalTurns} branch turns</span>
                  )}
                </div>

                {/* User Message Section */}
                <div className="details-message-block user-block">
                  <div className="message-block-header">
                    <div className="message-sender-info">
                      <i className="avatar user-avatar">A</i>
                      <div>
                        <strong>User Message</strong>
                        <small>Branch prompt</small>
                      </div>
                    </div>
                    <button
                      className="copy-btn"
                      onClick={() =>
                        copyToClipboard(turn.userMessage.content, `user-${turn.turnNumber}`)
                      }
                      title="Copy user message"
                    >
                      {copiedKey === `user-${turn.turnNumber}` ? "✓ Copied" : "Copy"}
                    </button>
                  </div>

                  {userAttachments.length > 0 && (
                    <div className="details-attachments">
                      <span className="attachments-title">Attached files:</span>
                      <div className="attachments-grid">
                        {userAttachments.map((file) => (
                          <div className="details-attachment-item" key={file.id}>
                            <span className="file-badge">
                              {file.content_type?.includes("pdf") ? "PDF" : "DOC"}
                            </span>
                            <span className="file-name" title={file.filename}>
                              {file.filename}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="user-message-body">
                    <p className="user-copy-full">{turn.userMessage.content}</p>
                  </div>
                </div>

                <div className="details-connector">
                  <span className="connector-line" />
                  <span className="connector-icon">↓</span>
                  <span className="connector-line" />
                </div>

                {/* AI Assistant Response Section */}
                <div className="details-message-block assistant-block">
                  <div className="message-block-header">
                    <div className="message-sender-info">
                      <i className="avatar assistant-avatar">✦</i>
                      <div>
                        <strong>Assistant Response</strong>
                        <span className="model-name-tag">{modelName}</span>
                      </div>
                    </div>
                    {turn.assistantMessage?.content && (
                      <button
                        className="copy-btn"
                        onClick={() =>
                          copyToClipboard(
                            turn.assistantMessage?.content || "",
                            `ai-${turn.turnNumber}`,
                          )
                        }
                        title="Copy AI response"
                      >
                        {copiedKey === `ai-${turn.turnNumber}` ? "✓ Copied" : "Copy"}
                      </button>
                    )}
                  </div>

                  <div className="assistant-message-body">
                    {turn.assistantMessage?.content ? (
                      <Reply content={turn.assistantMessage.content} />
                    ) : (
                      <p className="empty-response-note">
                        No response was recorded for this turn.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="details-footer branch-details-footer">
        {onOpenBranchChat && (
          <button
            className="open-branch-chat-btn"
            onClick={() => onOpenBranchChat(branchData)}
          >
            💬 Open Branch Chat
          </button>
        )}
        <button className="return-graph-btn" onClick={onClose}>
          Return to Graph
        </button>
      </div>
    </aside>
  );
}
