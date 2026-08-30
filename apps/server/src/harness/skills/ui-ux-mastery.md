---
name: ui-ux-mastery
triggers: ["ui", "component", "screen", "design", "layout", "a11y"]
companions: ["motion-interaction", "anti-ai-slop"]
---

# UI/UX Mastery Skill Pack

## Core Design Principles
1. **Design System Adherence**: Always read and strictly use `.caide/design-spec.json`.
2. **Visual Hierarchy**: One primary focus point per view. Clear contrast between headers (`24/bold`), body (`15/regular`), and captions (`13/regular`).
3. **Touch First**: Every interactive tap target must be at least `44px × 44px`.
4. **Three Mandatory States**:
   - **Empty State**: Friendly illustration or icon, bold headline, 1-line explanation, and single white pill CTA button.
   - **Loading State**: Subtle skeleton placeholders matching the exact card/row geometry.
   - **Error State**: Non-blocking banner or card with clear reason and retry trigger.
5. **Accessibility**: High contrast (`#FFFFFF` on `#0D0D0D`), keyboard/voiceover navigation labels, semantic element tagging.
