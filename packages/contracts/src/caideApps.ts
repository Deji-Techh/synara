import { Schema } from "effect";
import { ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";
import { ModelSelection } from "./orchestration";
import { ProjectFramework } from "./projectFramework";

// FILE: caideApps.ts
// Purpose: Contracts for the dyad-style app-creation flow — new apps are
// always created as ~/caide-apps/<slug> with an engine app row + first chat.
// Layer: Contracts (schema-only)

const CAIDE_APP_NAME_MAX_LENGTH = 64;

export const FLUTTER_APP_TEMPLATES = ["blank", "counter", "firebase", "supabase"] as const;
export type FlutterAppTemplateId = (typeof FLUTTER_APP_TEMPLATES)[number];

export const AppCreateInput = Schema.Struct({
  /** Human-facing app name; the server slugifies it into the folder name. */
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(CAIDE_APP_NAME_MAX_LENGTH)),
  /**
   * Composer model selection to seed the created project and its first thread
   * with. When omitted the server falls back to the engine default so plain
   * Home sends keep their Builder-first behavior.
   */
  modelSelection: Schema.optional(ModelSelection),
  /** Immutable project framework selected at creation time. */
  framework: Schema.optional(ProjectFramework),
  /**
   * Flutter template id. When omitted the server scaffolds the default
   * (Flutter counter) template so Home sends keep their Flutter-first behavior.
   */
  templateId: Schema.optional(Schema.Literals(["blank", "counter", "firebase", "supabase"])),
});
export type AppCreateInput = typeof AppCreateInput.Type;

export const AppCreateResult = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  /** Engine app rowid (engine-native identity). */
  appId: Schema.Number,
  /** Engine chat rowid of the app's first chat. */
  chatId: Schema.Number,
  /** Absolute workspace path (~/caide-apps/<slug>). */
  appPath: TrimmedNonEmptyString,
  framework: Schema.optional(ProjectFramework),
});
export type AppCreateResult = typeof AppCreateResult.Type;
