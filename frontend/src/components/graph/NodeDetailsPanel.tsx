import { useEffect, useState } from "react";
import { ConversationTurn } from "../../types";
import { Reply } from "../Reply";

interface NodeDetailsPanelProps {
  turn: ConversationTurn;
  modelName: string;
  onClose: () => void;
  onSelectTurn?: (turnNumber: number) => void;
}

export function NodeDetailsPanel({
  turn,
  modelName,
  onClose,
  onSelectTurn,
}: NodeDetailsPanelProps) {
  const [copiedSection, setCopiedSection] = useState<"user" | "ai" | null>(
    null,
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && turn.turnNumber > 1 && onSelectTurn) {
        onSelectTurn(turn.turnNumber - 1);
      } else if (
        e.key === "ArrowRight" &&
        turn.turnNumber < turn.totalTurns &&
        onSelectTurn
      ) {
        onSelectTurn(turn.turnNumber + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [turn, onClose, onSelectTurn]);

  const copyToClipboard = (text: string, section: "user" | "ai") => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 1800);
  };

  const userAttachments = turn.userMessage.attachments || [];

  return (
    <aside className="graph-details-panel" aria-label="Turn details">
      <div className="details-header">
        <div className="details-header-title">
          <span className="details-badge">Turn #{turn.turnNumber}</span>
          <span className="details-sub">of {turn.totalTurns} total turns</span>
        </div>
        <div className="details-header-actions">
          <button
            className="details-close-btn"
            onClick={onClose}
            aria-label="Close turn details panel"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="details-content">
        {/* User Message Section */}
        <div className="details-message-block user-block">
          <div className="message-block-header">
            <div className="message-sender-info">
              <i className="avatar user-avatar">A</i>
              <div>
                <strong>User Message</strong>
                <small>Prompt input</small>
              </div>
            </div>
            <button
              className="copy-btn"
              onClick={() =>
                copyToClipboard(turn.userMessage.content, "user")
              }
              title="Copy user message"
            >
              {copiedSection === "user" ? "✓ Copied" : "Copy"}
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
                    "ai",
                  )
                }
                title="Copy AI response"
              >
                {copiedSection === "ai" ? "✓ Copied" : "Copy"}
              </button>
            )}
          </div>

          <div className="assistant-message-body">
            {turn.assistantMessage?.content ? (
              <Reply content={turn.assistantMessage.content} />
            ) : turn.isGenerating ? (
              <div className="thinking-details">
                <span className="pulsing-dot" />
                <span>
                  Generating response in progress
                  <span className="thinking-dots" />
                </span>
              </div>
            ) : (
              <p className="empty-response-note">
                No response was recorded for this turn.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="details-footer">
        <div className="turn-navigation">
          <button
            className="nav-turn-btn prev-btn"
            disabled={turn.turnNumber <= 1}
            onClick={() => onSelectTurn?.(turn.turnNumber - 1)}
            title="Previous turn (Left arrow)"
          >
            ← Previous
          </button>
          <span className="turn-position-indicator">
            {turn.turnNumber} / {turn.totalTurns}
          </span>
          <button
            className="nav-turn-btn next-btn"
            disabled={turn.turnNumber >= turn.totalTurns}
            onClick={() => onSelectTurn?.(turn.turnNumber + 1)}
            title="Next turn (Right arrow)"
          >
            Next →
          </button>
        </div>
        <button className="return-graph-btn" onClick={onClose}>
          Return to Graph
        </button>
      </div>
    </aside>
  );
}
