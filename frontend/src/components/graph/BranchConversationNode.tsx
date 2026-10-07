import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { BranchNodeType } from "./types";
import { convertMessagesToTurns } from "./ConversationGraph";

export const BranchConversationNode = memo(function BranchConversationNode({
  data,
  selected,
}: NodeProps<BranchNodeType>) {
  const { branch, modelName, onOpenBranch, onCreateBranch } = data;

  const turns = convertMessagesToTurns(branch.messages, false);
  const lastTurn = turns[turns.length - 1];
  const preview = lastTurn?.userMessage?.content?.trim() || "(empty branch)";
  const hasResponse = !!lastTurn?.assistantMessage?.content;

  return (
    <div
      className={`branch-graph-node ${selected || data.isSelected ? "selected" : ""}`}
      data-context={branch.context_mode}
    >
      {/* Target handle - from parent or previous branch turn */}
      <Handle
        type="target"
        position={Position.Top}
        className="graph-node-handle branch-target-handle"
        id="top"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="graph-node-handle branch-target-handle-left"
        id="left"
      />

      <div className="branch-node-header">
        <div className="branch-node-meta">
          <span className="branch-icon">⎇</span>
          <span className="branch-label">Branch</span>
          {branch.context_mode === "inherit" ? (
            <span className="branch-ctx-badge inherit-badge" title="Inherits parent context">
              🔗 Inherited
            </span>
          ) : (
            <span className="branch-ctx-badge independent-badge" title="Independent context">
              🔓 Independent
            </span>
          )}
        </div>
        <div className="branch-node-stats">
          {turns.length > 0 && (
            <span className="branch-turn-count">
              {turns.length} {turns.length === 1 ? "turn" : "turns"}
            </span>
          )}
        </div>
      </div>

      <div className="branch-node-body">
        {turns.length === 0 ? (
          <p className="branch-empty-hint">
            Open this branch to start a new conversation here…
          </p>
        ) : (
          <>
            <div className="branch-node-preview">
              <span className="branch-user-icon">A</span>
              <p className="node-preview-text user-preview" title={preview}>
                {preview}
              </p>
            </div>
            {hasResponse && (
              <div className="branch-node-response-indicator">
                <span className="assistant-icon">✦</span>
                <span className="branch-response-label">
                  {modelName || "Assistant"} responded
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="branch-node-footer">
        <button
          className="branch-open-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBranch?.(branch);
          }}
          title="Open branch conversation"
        >
          💬 Open Branch
        </button>
        {turns.length > 0 && (
          <button
            className="branch-new-sub-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCreateBranch?.(branch.id, turns.length - 1);
            }}
            title="Create a sub-branch from the last turn of this branch"
          >
            ⎇+
          </button>
        )}
      </div>

      {/* Source handle - to next branch turn or sub-branch */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="graph-node-handle branch-source-handle"
        id="bottom"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="graph-node-handle branch-source-handle-right"
        id="right"
      />
    </div>
  );
});
