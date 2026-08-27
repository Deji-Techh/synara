/**
 * Slim skill index — replaces always-on injection of 25k+ token skill bodies.
 * Core prompt includes this index (~300 tokens). Heavy skill content is fetched
 * on-demand via `read_ui_reference` / `read_guide` / `execute_fork_skill` only
 * when the task's domain requires it.
 */

export const SKILL_INDEX_BLOCK = `
<skill_index>
Available on-demand skills — read exactly one when its trigger matches, do NOT preload all.
Each skill is a detailed guide; the core prompt below stays slim and you fetch the skill only when needed.

| Skill | When to read | How to read |
|-------|--------------|-------------|
| **ui-foundation** | Designing tokens, type scale, colors, spacing, components | \`read_ui_reference\` name="design-system" |
| **ux-flow** | Multi-screen flow, empty/loading/error states, IA, product archetype | \`read_ui_reference\` name="product-archetypes" + "screen-spec" |
| **motion** | Animation needed beyond instant press feedback | \`read_ui_reference\` name="motion-direction" + "anti-ai-slop" for motion rules |
| **platform-tabs** | Unsure if bottom tabs needed, tablet adaptation, navigation choice | \`read_ui_reference\` name="platform-patterns" |
| **anti-slop** | Ensuring distinctive, non-generic UI | \`read_ui_reference\` name="anti-slop" |
| **backend** | Auth, DB, payments, storage, Nitro server layer | \`read_guide\` (e.g. "provision-backend", "add-authentication") |
| **review** | Single final audit AFTER build complete — not per file | \`read_ui_reference\` name="quality-rubric" + "design-audit" |

Rules:
- For single-screen utilities (calculator, timer, counter, converter): SKIP ux-flow, SKIP persistent design-spec/motion-spec, SKIP 5-viewport audit — build minimal, focused UI.
- For multi-screen apps: read ux-flow + platform-tabs BEFORE coding, create design-spec.
- Review runs ONCE after you declare build complete. Do not re-audit after each file. Fix critical/major issues in one repair pass.
- Do not read all skills. Read the one whose domain matches the current step, then continue.
</skill_index>
`.trim();

export const SKILL_INDEX_REFERENCE_LIBRARY_BLOCK = `
<ui-ux-reference-library>
Detailed CAIDE design documents exist but are NOT inlined. Read them on demand with \`read_ui_reference\` (name parameter) or \`read_guide\` (guide parameter) before substantial work in that domain.

Quick index:
- design-system, component-contracts, product-archetypes, screen-spec, anti-slop, platform-patterns, quality-rubric, motion-direction, design-audit
- Guides: provision-backend, add-authentication, add-payments, add-storage-media, build-secure-backend, production-quality
</ui-ux-reference-library>
`.trim();
