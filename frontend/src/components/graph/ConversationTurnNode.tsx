import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { TurnNodeType } from "./types";

export const ConversationTurnNode = memo(function ConversationTurnNode({
  data,
  selected,
}: NodeProps<TurnNodeType>) {
  const { turn, modelName } = data;
  const userText = turn.userMessage.content.trim();
  const assistantText = turn.assistantMessage?.content?.trim();
  const attachmentCount = turn.userMessage.attachments?.length || 0;

  return (
    <div
      className={`conversation-graph-node ${selected || data.isSelected ? "selected" : ""} ${
        turn.isGenerating ? "generating" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="graph-node-handle target-handle"
      />

      <div className="node-header">
        <div className="node-turn-badge">
          <span className="turn-number">Turn #{turn.turnNumber}</span>
          {turn.totalTurns > 0 && (
            <span className="turn-total">of {turn.totalTurns}</span>
          )}
        </div>
        <div className="node-header-tags">
          {attachmentCount > 0 && (
            <span
              className="node-attachment-badge"
              title={`${attachmentCount} attached file${attachmentCount > 1 ? "s" : ""}`}
            >
              📎 {attachmentCount}
            </span>
          )}
          {turn.isGenerating && (
            <span className="node-status-badge generating-badge">
              <span className="pulsing-dot" /> Live
            </span>
          )}
        </div>
      </div>

      <div className="node-body">
        <div className="node-user-section">
          <div className="node-role-label">
            <span className="user-icon">A</span>
            <strong>User</strong>
          </div>
          <p className="node-preview-text user-preview" title={userText}>
            {userText || "(empty prompt)"}
          </p>
        </div>

        <div className="node-divider" />

        <div className="node-assistant-section">
          <div className="node-role-label">
            <span className="assistant-icon">✦</span>
            <span className="model-label">{modelName || "Assistant"}</span>
          </div>
          {turn.isGenerating && !assistantText ? (
            <p className="node-preview-text assistant-preview thinking-text">
              Generating response<span className="thinking-dots" />
            </p>
          ) : (
            <p
              className="node-preview-text assistant-preview"
              title={assistantText || "No response yet"}
            >
              {assistantText || "(no response)"}
            </p>
          )}
        </div>
      </div>

      <div className="node-footer">
        <span className="click-hint">Click turn for full details ↗</span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="graph-node-handle source-handle"
      />
    </div>
  );
});
