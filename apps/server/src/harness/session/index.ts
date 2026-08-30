/**
 * Session — append-only log with parentUuid chain and role-based context isolation.
 * model-visible ⟺ logged invariant.
 */
import { SessionStorage, type SessionLogEntry, type SessionStorageOptions } from "./storage.ts";
import {
  buildConversationChain,
  buildMessages,
  type BuildMessagesOptions,
  type ChatMessage,
  type HarnessRole,
} from "./buildChain.ts";

export { SessionStorage, type SessionLogEntry, type SessionStorageOptions } from "./storage.ts";
export {
  buildConversationChain,
  buildMessages,
  type BuildMessagesOptions,
  type ChatMessage,
  type HarnessRole,
} from "./buildChain.ts";

export class Session {
  public readonly sessionId: string;
  private storage: SessionStorage;
  private currentParentUuid: string | null = null;

  constructor(sessionId: string, storage?: SessionStorage) {
    this.sessionId = sessionId;
    this.storage = storage ?? new SessionStorage();
  }

  async append(
    type: string,
    data: unknown,
    parentUuid?: string | null,
  ): Promise<SessionLogEntry> {
    const effectiveParent = parentUuid !== undefined ? parentUuid : this.currentParentUuid;
    const entry = await this.storage.append(this.sessionId, type, data, effectiveParent);
    this.currentParentUuid = entry.id;
    return entry;
  }

  async flush(): Promise<void> {
    await this.storage.flush(this.sessionId);
  }

  async getEntries(): Promise<SessionLogEntry[]> {
    return this.storage.readEntries(this.sessionId);
  }

  async getChain(targetLeafId?: string): Promise<SessionLogEntry[]> {
    return buildConversationChain(this.sessionId, targetLeafId, this.storage);
  }

  async deriveMessages(options: BuildMessagesOptions = {}): Promise<ChatMessage[]> {
    const chain = await this.getChain();
    return buildMessages(chain, options);
  }

  getCurrentParentUuid(): string | null {
    return this.currentParentUuid;
  }

  setCurrentParentUuid(uuid: string | null): void {
    this.currentParentUuid = uuid;
  }
}
