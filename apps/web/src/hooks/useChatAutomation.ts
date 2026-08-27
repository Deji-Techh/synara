// FILE: useChatAutomation.ts
// Purpose: Automation setup per thread — extracted from ChatView.tsx useChatAutomationSetup.

import { useChatAutomationSetup } from "../components/chat/useChatAutomationSetup";
import type { ThreadId } from "@caide/contracts";

export function useChatAutomation(threadId: ThreadId) {
  return useChatAutomationSetup(threadId);
}
