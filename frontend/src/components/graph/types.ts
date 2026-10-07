import { Node, Edge } from "@xyflow/react";
import { ConversationTurn } from "../../types";

export type GraphNodeData = {
  turn: ConversationTurn;
  modelName: string;
  isSelected?: boolean;
};

export type TurnNodeType = Node<GraphNodeData, "turnNode">;
export type TurnEdgeType = Edge;
