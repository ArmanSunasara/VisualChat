import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  MarkerType,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Message, ConversationTurn, BranchConversation, BranchMap } from "../../types";
import { ConversationTurnNode } from "./ConversationTurnNode";
import { BranchConversationNode } from "./BranchConversationNode";
import { NodeDetailsPanel } from "./NodeDetailsPanel";
import { BranchDetailsPanel } from "./BranchDetailsPanel";
import { BranchCreationDialog } from "./BranchCreationDialog";
import { TurnNodeType, BranchNodeType, TurnEdgeType } from "./types";
import { authFetch, apiUrl } from "../../api";
import "./graph.css";

const nodeTypes = {
  turnNode: ConversationTurnNode,
  branchNode: BranchConversationNode,
};

// Layout constants
const NODE_WIDTH = 310;
const BRANCH_NODE_WIDTH = 250;
const NODE_GAP_X = 130;
const BRANCH_GAP_X = 90;
const BASE_Y = 200;
const START_X = 60;
const BRANCH_GAP_Y = 100; // vertical gap between main row and branch
const BRANCH_ROW_H = 180; // height of a branch node
const BRANCH_SIDE_GAP = 40; // horizontal between sibling branches

export function convertMessagesToTurns(
  messages: Message[],
  busy: boolean = false,
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: Partial<ConversationTurn> | null = null;
  let turnNumber = 1;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user") {
      if (currentTurn && currentTurn.userMessage) {
        turns.push({
          id: `turn-${turnNumber}`,
          turnNumber,
          totalTurns: 0,
          userMessage: currentTurn.userMessage,
          assistantMessage: currentTurn.assistantMessage,
          isGenerating: false,
        });
        turnNumber++;
      }
      currentTurn = {
        id: `turn-${turnNumber}`,
        turnNumber,
        userMessage: msg,
      };
    } else if (msg.role === "assistant") {
      if (currentTurn && currentTurn.userMessage) {
        currentTurn.assistantMessage = msg;
        turns.push({
          id: `turn-${turnNumber}`,
          turnNumber,
          totalTurns: 0,
          userMessage: currentTurn.userMessage,
          assistantMessage: currentTurn.assistantMessage,
          isGenerating: busy && i === messages.length - 1,
        });
        turnNumber++;
        currentTurn = null;
      } else {
        turns.push({
          id: `turn-${turnNumber}`,
          turnNumber,
          totalTurns: 0,
          userMessage: { role: "user", content: "Initial Prompt / Query" },
          assistantMessage: msg,
          isGenerating: busy && i === messages.length - 1,
        });
        turnNumber++;
      }
    }
  }

  if (currentTurn && currentTurn.userMessage) {
    turns.push({
      id: `turn-${turnNumber}`,
      turnNumber,
      totalTurns: 0,
      userMessage: currentTurn.userMessage,
      assistantMessage: currentTurn.assistantMessage,
      isGenerating: busy,
    });
  }

  const total = turns.length;
  turns.forEach((t) => {
    t.totalTurns = total;
  });

  return turns;
}

interface ConversationGraphProps {
  conversationId?: string;
  conversationTitle?: string;
  messages: Message[];
  modelName: string;
  busy?: boolean;
  onSwitchToChat?: () => void;
  onOpenBranchChat?: (branch: BranchConversation) => void;
}

interface BranchDialogState {
  turnIndex: number;  // 0-based turn index in a conversation
  parentConversationId: string;
}

function InnerGraph({
  conversationId,
  conversationTitle,
  messages,
  modelName,
  busy = false,
  onSwitchToChat,
  onOpenBranchChat,
}: ConversationGraphProps) {
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [branchMap, setBranchMap] = useState<BranchMap>({});
  const [branchDialog, setBranchDialog] = useState<BranchDialogState | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const { fitView } = useReactFlow();
  const prevConvIdRef = useRef<string | undefined>(undefined);

  // Fetch branches when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setBranchMap({});
      return;
    }
    if (prevConvIdRef.current !== conversationId) {
      prevConvIdRef.current = conversationId;
      setBranchMap({});
    }
    fetchBranches(conversationId);
  }, [conversationId, messages.length]); // refetch when new turns are added too

  async function fetchBranches(convId: string) {
    try {
      const resp = await authFetch(apiUrl(`/api/conversations/${convId}/branches`));
      if (!resp.ok) return;
      const data = await resp.json();
      const map: BranchMap = {};
      for (const b of data.branches as BranchConversation[]) {
        const idx = b.parent_turn_index;
        if (!map[idx]) map[idx] = [];
        map[idx].push(b);
      }
      setBranchMap(map);
    } catch {
      // silently ignore – branch UI is optional
    }
  }

  async function handleCreateBranch(contextMode: "inherit" | "independent") {
    if (!branchDialog || !conversationId) return;
    setCreatingBranch(true);
    try {
      const resp = await authFetch(
        apiUrl(`/api/conversations/${branchDialog.parentConversationId}/branches`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parent_conversation_id: branchDialog.parentConversationId,
            parent_turn_index: branchDialog.turnIndex,
            context_mode: contextMode,
          }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Failed to create branch");
      }
      const branch: BranchConversation = await resp.json();
      branch.messages = [];
      branch.has_children = false;
      setBranchMap((prev) => {
        const idx = branch.parent_turn_index;
        return { ...prev, [idx]: [...(prev[idx] || []), branch] };
      });
      setBranchDialog(null);
      // Auto-open the new branch for chatting
      onOpenBranchChat?.(branch);
    } catch (e) {
      alert(String(e));
    } finally {
      setCreatingBranch(false);
    }
  }

  const turns = useMemo(
    () => convertMessagesToTurns(messages, busy),
    [messages, busy],
  );

  // Build nodes + edges including branch nodes
  const { nodes: computedNodes, edges: computedEdges } = useMemo(() => {
    const nodes: (TurnNodeType | BranchNodeType)[] = [];
    const edges: TurnEdgeType[] = [];

    // Main-row turn nodes
    turns.forEach((turn, index) => {
      const x = START_X + index * (NODE_WIDTH + NODE_GAP_X);
      const branches = branchMap[turn.turnNumber - 1] || [];

      nodes.push({
        id: turn.id,
        type: "turnNode",
        position: { x, y: BASE_Y },
        data: {
          turn,
          modelName,
          isSelected: selectedTurnId === turn.id,
          branches,
          onCreateBranch: conversationId
            ? (turnIdx: number) => {
                setBranchDialog({ turnIndex: turnIdx, parentConversationId: conversationId });
              }
            : undefined,
          onOpenBranch: onOpenBranchChat,
        },
      } as TurnNodeType);

      // Edges between main turns
      if (index > 0) {
        const prevTurn = turns[index - 1];
        edges.push({
          id: `edge-main-${prevTurn.id}-${turn.id}`,
          source: prevTurn.id,
          target: turn.id,
          type: "smoothstep",
          animated: turn.isGenerating,
          style: { stroke: "#486854", strokeWidth: 2.5 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#b9f16e",
            width: 18,
            height: 18,
          },
        });
      }

      // Branch nodes hanging below each turn
      if (branches.length > 0) {
        const mainNodeCenterX = x + NODE_WIDTH / 2;
        const totalBranchWidth =
          branches.length * BRANCH_NODE_WIDTH +
          (branches.length - 1) * BRANCH_SIDE_GAP;
        const branchStartX = mainNodeCenterX - totalBranchWidth / 2;
        const branchY = BASE_Y + 220 + BRANCH_GAP_Y; // below main row

        branches.forEach((branch, bIdx) => {
          const bx = branchStartX + bIdx * (BRANCH_NODE_WIDTH + BRANCH_SIDE_GAP);
          const branchNodeId = `branch-${branch.id}`;

          nodes.push({
            id: branchNodeId,
            type: "branchNode",
            position: { x: bx, y: branchY },
            data: {
              branch,
              turnIndex: turn.turnNumber - 1,
              branchIndex: bIdx,
              totalSiblings: branches.length,
              modelName,
              isSelected: selectedBranchId === branch.id,
              onOpenBranch: onOpenBranchChat,
              onCreateBranch: (_branchId: string, _turnIdx: number) => {
                // Sub-branching: parent is the branch conversation itself
                setBranchDialog({ turnIndex: _turnIdx, parentConversationId: _branchId });
              },
            },
          } as BranchNodeType);

          // Edge from main turn bottom to branch node top
          edges.push({
            id: `edge-branch-${turn.id}-${branchNodeId}`,
            source: turn.id,
            sourceHandle: "branch-out",
            target: branchNodeId,
            targetHandle: "top",
            type: "smoothstep",
            style: {
              stroke: "#3a5c44",
              strokeWidth: 2,
              strokeDasharray: "6,4",
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#8be04e",
              width: 14,
              height: 14,
            },
          });
        });
      }
    });

    return { nodes, edges };
  }, [turns, branchMap, modelName, selectedTurnId, selectedBranchId, conversationId, onOpenBranchChat]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [computedNodes, computedEdges, setNodes, setEdges]);

  useEffect(() => {
    if (turns.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.25, duration: 400 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [turns.length, fitView]);

  const selectedTurn = useMemo(
    () => turns.find((t) => t.id === selectedTurnId) || null,
    [turns, selectedTurnId],
  );

  const selectedBranch = useMemo(() => {
    if (!selectedBranchId) return null;
    for (const branches of Object.values(branchMap)) {
      const found = branches.find((b) => b.id === selectedBranchId);
      if (found) return found;
    }
    return null;
  }, [branchMap, selectedBranchId]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "turnNode") {
      setSelectedTurnId(node.id);
      setSelectedBranchId(null);
    } else if (node.type === "branchNode") {
      const branchData = (node.data as any)?.branch as BranchConversation;
      if (branchData) {
        setSelectedBranchId(branchData.id);
        setSelectedTurnId(null);
      }
    }
  }, []);

  const handleSelectTurnByNumber = useCallback(
    (turnNumber: number) => {
      const target = turns.find((t) => t.turnNumber === turnNumber);
      if (target) setSelectedTurnId(target.id);
    },
    [turns],
  );

  const totalBranches = Object.values(branchMap).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="conversation-graph-container">
      <div className="graph-top-bar">
        <div className="graph-meta">
          <span className="graph-title">☊ Horizontal Turn Graph</span>
          <span className="graph-count-pill">
            {turns.length} {turns.length === 1 ? "turn" : "turns"}
          </span>
          {totalBranches > 0 && (
            <span className="graph-branch-pill">
              ⎇ {totalBranches} {totalBranches === 1 ? "branch" : "branches"}
            </span>
          )}
          {busy && <span className="graph-live-indicator">● Streaming turn</span>}
        </div>
        <div className="graph-actions">
          <button
            className="graph-action-btn"
            onClick={() => fitView({ padding: 0.25, duration: 300 })}
            title="Fit graph to view"
          >
            ⛶ Fit View
          </button>
          <span className="graph-hint">
            Scroll to zoom • Drag canvas • Click node for details • ⎇ Branch to diverge
          </span>
        </div>
      </div>

      {turns.length === 0 ? (
        <div className="graph-empty-state">
          <div className="empty-icon">☊</div>
          <h3>No Conversation Nodes Yet</h3>
          <p>
            This chat does not contain any messages yet. Start chatting in the
            Chat view to generate graph turns.
          </p>
          {onSwitchToChat && (
            <button className="empty-switch-btn" onClick={onSwitchToChat}>
              💬 Switch to Chat View
            </button>
          )}
        </div>
      ) : (
        <div className="graph-canvas-wrapper">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.15}
            maxZoom={2}
            defaultEdgeOptions={{ type: "smoothstep" }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.5}
              color="#23342b"
            />
            <Controls className="graph-controls-custom" showInteractive={false} />
            <MiniMap
              className="graph-minimap-custom"
              nodeColor={(n) => (n.type === "branchNode" ? "#1e3427" : "#293c31")}
              maskColor="rgba(10, 15, 13, 0.85)"
              zoomable
              pannable
            />
          </ReactFlow>

          {selectedTurn && (
            <NodeDetailsPanel
              turn={selectedTurn}
              modelName={modelName}
              onClose={() => setSelectedTurnId(null)}
              onSelectTurn={handleSelectTurnByNumber}
            />
          )}

          {selectedBranch && (
            <BranchDetailsPanel
              branch={selectedBranch}
              modelName={modelName}
              onClose={() => setSelectedBranchId(null)}
              onOpenBranchChat={(branch) => {
                setSelectedBranchId(null);
                onOpenBranchChat?.(branch);
              }}
            />
          )}
        </div>
      )}

      {branchDialog && (
        <BranchCreationDialog
          parentTitle={conversationTitle || ""}
          turnNumber={branchDialog.turnIndex + 1}
          onConfirm={handleCreateBranch}
          onCancel={() => setBranchDialog(null)}
          creating={creatingBranch}
        />
      )}
    </div>
  );
}

export function ConversationGraph(props: ConversationGraphProps) {
  return (
    <ReactFlowProvider>
      <InnerGraph {...props} />
    </ReactFlowProvider>
  );
}
