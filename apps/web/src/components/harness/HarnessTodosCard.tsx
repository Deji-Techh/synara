// FILE: HarnessTodosCard.tsx
// Purpose: Persistent TodoList header for harness sessions. Renders the live
// todo list pushed by update_todos (todos_update event) above the transcript:
// collapsed it shows the in-progress task + (done/total); expanded it lists
// every todo with its status. Donor behavior ported from Dyad's TodoList.tsx
// into Caide card primitives + Tabler icons (no lucide dependency on web).

import { useState } from "react";
import { IconCircle, IconCircleCheck, IconListCheck, IconLoader2 } from "@tabler/icons-react";
import { useHarnessStore, type TodoEntry } from "~/harnessStore";
import {
  CaideBadge,
  CaideCard,
  CaideCardHeader,
  CaideLazyContent,
} from "~/components/chat/CaideCardPrimitives";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";

function StatusIcon(props: { status: TodoEntry["status"]; className?: string }) {
  if (props.status === "completed") {
    return <IconCircleCheck size={14} className="shrink-0 text-green-500" />;
  }
  if (props.status === "in_progress") {
    return <IconLoader2 size={14} className={`shrink-0 animate-spin text-blue-500 ${props.className ?? ""}`} />;
  }
  return <IconCircle size={14} className="shrink-0 text-muted-foreground" />;
}

export function HarnessTodosCard(props: { sessionId: string }) {
  const state = useHarnessStore();
  const todos = state.sessions[props.sessionId]?.todos ?? [];
  const [open, setOpen] = useState(false);

  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;
  const allDone = completed === total;
  const inProgress = todos.find((t) => t.status === "in_progress");

  return (
    <div className="my-2 select-none">
      <CaideCard accent={allDone ? "success" : "info"} onClick={() => setOpen((v) => !v)} isExpanded={open}>
        <CaideCardHeader accent={allDone ? "success" : "info"}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {open ? (
              <>
                <IconListCheck size={14} className="shrink-0 text-muted-foreground" />
                <span className="text-[12px] font-semibold tracking-tight">
                  {completed} of {total} to-dos completed
                </span>
              </>
            ) : inProgress ? (
              <>
                <StatusIcon status="in_progress" />
                <span className="truncate text-[12px] font-semibold tracking-tight">{inProgress.content}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  ({completed}/{total})
                </span>
              </>
            ) : (
              <>
                {allDone ? (
                  <IconCircleCheck size={14} className="shrink-0 text-green-500" />
                ) : (
                  <IconCircle size={14} className="shrink-0 text-muted-foreground" />
                )}
                <span className="text-[12px] text-muted-foreground">
                  {allDone ? "All tasks completed" : "No task in progress"}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  ({completed}/{total})
                </span>
              </>
            )}
          </div>
          <CaideBadge accent={allDone ? "success" : "info"}>To-dos</CaideBadge>
          <DisclosureChevron open={open} className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        </CaideCardHeader>
        <CaideLazyContent open={open}>
          <ul className="flex flex-col gap-1.5 overflow-hidden rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className={`flex items-center gap-2.5 py-0.5 text-[12px] ${
                  todo.status === "completed" ? "text-muted-foreground" : "text-foreground/90"
                }`}
              >
                <StatusIcon status={todo.status} />
                <span className={todo.status === "completed" ? "line-through" : undefined}>
                  {todo.content}
                </span>
              </li>
            ))}
          </ul>
        </CaideLazyContent>
      </CaideCard>
    </div>
  );
}
