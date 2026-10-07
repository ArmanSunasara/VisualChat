import { useState, useMemo, useCallback, useEffect } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Message, ConversationTurn } from "../../types";
import { ConversationTurnNode } from "./ConversationTurnNode";
import { NodeDetailsPanel } from "./NodeDetailsPanel";
import { TurnNodeType, TurnEdgeType } from "./types";
import "./graph.css";

const nodeTypes = {
  turnNode: ConversationTurnNode,
};

const NODE_WIDTH = 320;
const NODE_GAP_X = 130;
const BASE_Y = 160;
const START_X = 60;

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
  messages: Message[];
  modelName: string;
  busy?: boolean;
  onSwitchToChat?: () => void;
}

function InnerGraph({
  messages,
  modelName,
  busy = false,
  onSwitchToChat,
}: ConversationGraphProps) {
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  const turns = useMemo(
    () => convertMessagesToTurns(messages, busy),
    [messages, busy],
  );

  const initialNodesAndEdges = useMemo(() => {
    const nodes: TurnNodeType[] = turns.map((turn, index) => ({
      id: turn.id,
      type: "turnNode",
      position: {
        x: START_X + index * (NODE_WIDTH + NODE_GAP_X),
        y: BASE_Y,
      },
      data: {
        turn,
        modelName,
        isSelected: selectedTurnId === turn.id,
      },
    }));

    const edges: TurnEdgeType[] = [];
    for (let i = 0; i < turns.length - 1; i++) {
      const sourceId = turns[i].id;
      const targetId = turns[i + 1].id;
      edges.push({
        id: `edge-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        animated: turns[i + 1].isGenerating,
        style: {
          stroke: "#486854",
          strokeWidth: 2.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#b9f16e",
          width: 18,
          height: 18,
        },
      });
    }

    return { nodes, edges };
  }, [turns, modelName, selectedTurnId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialNodesAndEdges.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialNodesAndEdges.edges,
  );

  useEffect(() => {
    setNodes(initialNodesAndEdges.nodes);
    setEdges(initialNodesAndEdges.edges);
  }, [initialNodesAndEdges, setNodes, setEdges]);

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

  const onNodeClick = useCallback((_: React.MouseEvent, node: TurnNodeType) => {
    setSelectedTurnId(node.id);
  }, []);

  const handleSelectTurnByNumber = useCallback(
    (turnNumber: number) => {
      const target = turns.find((t) => t.turnNumber === turnNumber);
      if (target) {
        setSelectedTurnId(target.id);
      }
    },
    [turns],
  );

  return (
    <div className="conversation-graph-container">
      <div className="graph-top-bar">
        <div className="graph-meta">
          <span className="graph-title">☊ Horizontal Turn Graph</span>
          <span className="graph-count-pill">
            {turns.length} {turns.length === 1 ? "turn" : "turns"}
          </span>
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
            Scroll to zoom • Drag canvas • Click node for details
          </span>
        </div>
      </div>

      {turns.length === 0 ? (
        <div className="graph-empty-state">
          <div className="empty-icon">☊</div>
          <h3>No Conversation Nodes Yet</h3>
          <p>
            This chat does not contain any messages yet. Start chatting in the
            Chat view or send a prompt below to generate graph turns.
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
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{
              type: "smoothstep",
            }}
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
              nodeColor="#293c31"
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
        </div>
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
