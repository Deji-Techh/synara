// FILE: todoStore.ts
// Purpose: Turn/session-scoped todo list backing update_todos.
// Donor: dyad x caide local_agent/todo_persistence (merge/replace semantics
// kept); turn state lives here per session instead of AgentContext, and M3
// persists it into the session JSONL log.

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
}

export class TodoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodoValidationError";
  }
}

const stores = new Map<string, Todo[]>();

export function getTodos(sessionId: string): Todo[] {
  return stores.get(sessionId) ?? [];
}

export function setTodos(sessionId: string, todos: Todo[]): void {
  stores.set(sessionId, todos);
}

export function clearTodos(sessionId: string): void {
  stores.delete(sessionId);
}

export interface TodoUpdate {
  id: string;
  content?: string;
  status?: TodoStatus;
}

/**
 * Donor merge/replace semantics verbatim: merge updates by id (new ids
 * require content+status); replace requires full fields on every item.
 */
export function applyTodoUpdate(sessionId: string, merge: boolean, updates: TodoUpdate[]): Todo[] {
  if (merge) {
    const byId = new Map(getTodos(sessionId).map((t) => [t.id, { ...t }]));
    for (const todo of updates) {
      const existing = byId.get(todo.id);
      if (existing) {
        byId.set(todo.id, {
          ...existing,
          ...(todo.content !== undefined && { content: todo.content }),
          ...(todo.status !== undefined && { status: todo.status }),
        });
      } else {
        if (todo.content === undefined || todo.status === undefined) {
          throw new TodoValidationError(
            `New todo with id "${todo.id}" must have content and status defined`,
          );
        }
        byId.set(todo.id, { id: todo.id, content: todo.content, status: todo.status });
      }
    }
    const next = Array.from(byId.values());
    setTodos(sessionId, next);
    return next;
  }
  const next: Todo[] = updates.map((todo) => {
    if (todo.content === undefined || todo.status === undefined) {
      throw new TodoValidationError(
        `Todo with id "${todo.id}" must have content and status defined in replace mode`,
      );
    }
    return { id: todo.id, content: todo.content, status: todo.status };
  });
  setTodos(sessionId, next);
  return next;
}
