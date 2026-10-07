import { Node, Edge } from "@xyflow/react";
import { ConversationTurn, BranchConversation } from "../../types";

export type GraphNodeData = {
  turn: ConversationTurn;
  modelName: string;
  isSelected?: boolean;
  branches?: BranchConversation[];
  onCreateBranch?: (turnIndex: number) => void;
  onOpenBranch?: (branch: BranchConversation) => void;
};

export type TurnNodeType = Node<GraphNodeData, "turnNode">;

/** Branch group node: a vertical lane of branch turns hanging off a main turn */
export type BranchNodeData = {
  branch: BranchConversation;
  turnIndex: number;         // which main turn this branch hangs from
  branchIndex: number;       // sibling order (0-based)
  totalSiblings: number;
  modelName: string;
  isSelected?: boolean;
  onOpenBranch?: (branch: BranchConversation) => void;
  onCreateBranch?: (branchId: string, turnIndex: number) => void;
};

export type BranchNodeType = Node<BranchNodeData, "branchNode">;

export type TurnEdgeType = Edge;
