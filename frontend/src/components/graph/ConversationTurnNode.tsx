import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { TurnNodeType } from "./types";

export const ConversationTurnNode = memo(function ConversationTurnNode({
  data,
  selected,
}: NodeProps<TurnNodeType>) {
  const { turn, modelName, branches = [], onCreateBranch, onOpenBranch } = data;
  const userText = turn.userMessage.content.trim();
  const assistantText = turn.assistantMessage?.content?.trim();
  const attachmentCount = turn.userMessage.attachments?.length || 0;
  // Only show branch button when there's a complete turn (user + assistant)
  const canBranch = !!turn.assistantMessage && !turn.isGenerating;
  const branchCount = branches.length;

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
          {branchCount > 0 && (
            <span className="node-branch-count" title={`${branchCount} branch${branchCount > 1 ? "es" : ""}`}>
              ⎇ {branchCount}
            </span>
          )}
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
        <span className="click-hint">Click for full details ↗</span>
        {canBranch && (
          <button
            className="node-branch-btn"
            title="Create a branch from this turn"
            onClick={(e) => {
              e.stopPropagation();
              onCreateBranch?.(turn.turnNumber - 1);
            }}
          >
            ⎇ Branch
          </button>
        )}
        {branchCount > 0 && onOpenBranch && (
          <button
            className="node-show-branches-btn"
            title="Show branches"
            onClick={(e) => {
              e.stopPropagation();
              if (branches[0]) onOpenBranch(branches[0]);
            }}
          >
            ⎇ {branchCount}
          </button>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="graph-node-handle source-handle"
      />
      {/* Bottom handle for branches to connect to */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="graph-node-handle branch-attach-handle"
        id="branch-out"
      />
    </div>
  );
});
