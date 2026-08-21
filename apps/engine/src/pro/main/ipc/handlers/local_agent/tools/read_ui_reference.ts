import { z } from "zod";
import { ToolDefinition, escapeXmlAttr } from "./types";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { rawAsset } from "@/raw-assets";

const references: Record<string, { title: string; description: string }> = {
  "product-archetypes": {
    title: "Product Archetypes",
    description:
      "Decision matrix of product archetypes and the UX patterns each demands.",
  },
  "design-system": {
    title: "Design System",
    description:
      "Design tokens, type scales, colour systems, spacing rhythm, and component library structure.",
  },
  "component-contracts": {
    title: "Component Contracts",
    description:
      "Behavioural contracts for common components: states, props, a11y, and interaction rules.",
  },
  accessibility: {
    title: "Accessibility",
    description:
      "WCAG-aligned checklist for contrast, focus, semantics, touch targets, and screen readers.",
  },
  "anti-slop": {
    title: "Anti-Slop and Distinctiveness",
    description:
      "Banned default aesthetics and concrete techniques for distinctive, non-generic UI.",
  },
  "design-to-code": {
    title: "Design to Code",
    description:
      "Translating design specs into production frontend code without losing intent.",
  },
  "platform-patterns": {
    title: "Platform Patterns",
    description:
      "Platform-idiomatic navigation, gestures, and system integration patterns.",
  },
  "quality-rubric": {
    title: "Quality Rubric",
    description:
      "Scoring rubric to audit a UI against professional quality gates before delivery.",
  },
  "motion-direction": {
    title: "Motion Direction and Capability Routing",
    description:
      "Motion language, durations, easings, and when to use which animation capability.",
  },
};

const templates: Record<string, { title: string; description: string }> = {
  "screen-spec": {
    title: "Screen Spec",
    description: "Template for specifying a full screen before implementing it.",
  },
  "component-contract": {
    title: "Component Contract",
    description: "Template for specifying a component's contract before building it.",
  },
  "design-audit": {
    title: "Design Audit",
    description: "Template for auditing an existing UI against the quality rubric.",
  },
  "design-spec": {
    title: "Persistent Design Spec",
    description: "Structure of the persistent .caide/design-spec.json document.",
  },
  "motion-storyboard": {
    title: "Persistent Motion Storyboard",
    description: "Structure of the persistent .caide/motion-spec.json document.",
  },
};

const companionSkills: Record<string, { title: string; description: string }> = {
  "anti-ai-slop": {
    title: "Anti AI Slop",
    description:
      "Full companion skill: rules that keep generated apps from looking AI-generated.",
  },
};

export interface UiLibraryEntry {
  kind: "reference" | "template" | "companion-skill";
  title: string;
  description: string;
  content: string;
}

export const UI_LIBRARY: Record<string, UiLibraryEntry> = {};

for (const [name, meta] of Object.entries(references)) {
  UI_LIBRARY[name] = {
    ...meta,
    kind: "reference",
    content: rawAsset(`src/prompts/skills/ui-ux-mastery/references/${name}.md`),
  };
}
for (const [name, meta] of Object.entries(templates)) {
  UI_LIBRARY[name] = {
    ...meta,
    kind: "template",
    content: rawAsset(`src/prompts/skills/ui-ux-mastery/templates/${name}.md`),
  };
}
for (const [name, meta] of Object.entries(companionSkills)) {
  UI_LIBRARY[name] = {
    ...meta,
    kind: "companion-skill",
    content: rawAsset(`src/prompts/skills/${name}/SKILL.md`),
  };
}

export const UI_REFERENCE_NAMES = Object.keys(UI_LIBRARY).sort();

export function getUiReferenceContent(name: string): string {
  const entry = UI_LIBRARY[name];
  if (!entry) {
    const available = UI_REFERENCE_NAMES.join(", ");
    throw new CaideError(
      `UI reference "${name}" not found. Available: ${available}`,
      CaideErrorKind.NotFound,
    );
  }
  return entry.content;
}

const readUiReferenceSchema = z.object({
  name: z
    .string()
    .describe(
      `Document name. Available documents: ${UI_REFERENCE_NAMES.join(", ")}`,
    ),
});

export const readUiReferenceTool: ToolDefinition<
  z.infer<typeof readUiReferenceSchema>
> = {
  name: "read_ui_reference",
  description:
    "Read a detailed CAIDE design reference document, template, or skill on demand. " +
    `Available documents: ${UI_REFERENCE_NAMES.join(", ")}. Consult these before substantial UI work or when auditing design quality.`,
  inputSchema: readUiReferenceSchema,
  defaultConsent: "always",
  isReadOnly: true,

  // The Flutter path carries its own self-contained Dart/Material skill pack;
  // this library is web/CSS-oriented and must not be offered there.
  isEnabled: (ctx) => ctx.frameworkType !== "flutter",

  getConsentPreview: (args) => `Read UI reference: ${args.name}`,

  buildXml: (args) => {
    if (!args.name) return undefined;
    return `<caide-read-ui-reference name="${escapeXmlAttr(args.name)}"></caide-read-ui-reference>`;
  },

  execute: async (args) => getUiReferenceContent(args.name),
};
