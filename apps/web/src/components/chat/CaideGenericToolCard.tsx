// FILE: CaideGenericToolCard.tsx
// Purpose: Back-compat alias — the generic card is now the themed
// CaideClaudeToolCard (per-tool accents, no emoji). Kept so older imports
// keep rendering identically.

import React from "react";
import {
  CaideClaudeToolCard,
  type ToolCardStatus,
} from "./CaideClaudeToolCard";

interface CaideGenericToolCardProps {
  toolName: string;
  attributes?: Record<string, string>;
  content?: string;
  state?: ToolCardStatus | string;
}

export const CaideGenericToolCard: React.FC<CaideGenericToolCardProps> = (props) => {
  return <CaideClaudeToolCard {...props} />;
};
