import { useState } from "react";

interface BranchCreationDialogProps {
  parentTitle: string;
  turnNumber: number;
  onConfirm: (contextMode: "inherit" | "independent") => void;
  onCancel: () => void;
  creating?: boolean;
}

export function BranchCreationDialog({
  parentTitle,
  turnNumber,
  onConfirm,
  onCancel,
  creating = false,
}: BranchCreationDialogProps) {
  const [contextMode, setContextMode] = useState<"inherit" | "independent">("inherit");

  return (
    <div
      className="branch-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="branch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-dialog-title"
      >
        <div className="branch-dialog-header">
          <span className="branch-dialog-icon">⎇</span>
          <h3 id="branch-dialog-title">Create Branch</h3>
          <button
            className="branch-dialog-close"
            onClick={onCancel}
            aria-label="Cancel branch creation"
          >
            ✕
          </button>
        </div>

        <div className="branch-dialog-body">
          <div className="branch-dialog-info">
            <p>
              Branching from <strong>Turn #{turnNumber}</strong>
              {parentTitle && parentTitle !== "New chat" && (
                <> of <em className="branch-parent-title">"{parentTitle}"</em></>
              )}
            </p>
            <small>
              A new independent conversation will be created, branching at this
              point. The branch appears in the graph below the selected turn.
            </small>
          </div>

          <div className="branch-context-options">
            <div className="branch-context-label">Context mode:</div>

            <label
              className={`branch-option ${contextMode === "inherit" ? "selected" : ""}`}
              htmlFor="ctx-inherit"
            >
              <input
                type="radio"
                id="ctx-inherit"
                name="contextMode"
                value="inherit"
                checked={contextMode === "inherit"}
                onChange={() => setContextMode("inherit")}
              />
              <div className="branch-option-content">
                <span className="branch-option-icon">🔗</span>
                <div>
                  <strong>Inherit Context</strong>
                  <small>
                    Branch sees the full conversation up to Turn #{turnNumber}.
                    AI responses will be aware of the parent conversation history.
                  </small>
                </div>
              </div>
            </label>

            <label
              className={`branch-option ${contextMode === "independent" ? "selected" : ""}`}
              htmlFor="ctx-independent"
            >
              <input
                type="radio"
                id="ctx-independent"
                name="contextMode"
                value="independent"
                checked={contextMode === "independent"}
                onChange={() => setContextMode("independent")}
              />
              <div className="branch-option-content">
                <span className="branch-option-icon">🔓</span>
                <div>
                  <strong>Independent</strong>
                  <small>
                    Branch starts fresh with no prior context. AI only sees
                    messages within this branch.
                  </small>
                </div>
              </div>
            </label>
          </div>
        </div>

        <div className="branch-dialog-footer">
          <button
            className="branch-cancel-btn"
            onClick={onCancel}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            className="branch-confirm-btn"
            onClick={() => onConfirm(contextMode)}
            disabled={creating}
          >
            {creating ? (
              <>
                <span className="pulsing-dot small-dot" /> Creating…
              </>
            ) : (
              <>⎇ Create Branch</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
