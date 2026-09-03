// FILE: webSkillPack.ts
// Purpose: UI/UX guidance for the "web app" build target.
// Donor: dyad x caide src/prompts/web_ui_skill_pack.ts (verbatim).
// Counterpart to the mobile skill pack assembled in skillPacks.ts.

export const CAIDE_WEB_UI_SKILL_PACK = `
## Web UI / UX Guidelines

You are building a **responsive web app**, not a mobile app. Follow these rules
so the result looks and works like a polished website on every device.

- **Desktop is the primary canvas.** Design for a desktop browser first, then
  make it reflow gracefully to tablet and phone widths. Never build a fixed
  phone-width page and "stretch" it — that produces a broken desktop site.
- **Navigation**: use a top navbar or a sidebar for primary navigation. Do NOT
  use a bottom tab bar — that is a mobile-app pattern and does not belong in a
  desktop-focused web app.
- **Input parity**: every action must work with a mouse AND a keyboard AND
  touch. Do not gate functionality behind hover. Show visible focus rings for
  keyboard users.
- **Layouts**: on desktop, use the space — multi-column grids, sidebars,
  tables, and forms are expected. Avoid large empty gutters or one enormous
  centered column at desktop widths.
- **Responsive breakpoints**: mobile <640px, tablet 640–1024px, desktop
  >1024px. No horizontal scrolling. Content reflows and largely reuses the same
  semantic DOM; don't build fully separate desktop/mobile UIs unless the design
  genuinely calls for it.
- **Typography & density**: use proper web type sizes and comfortable line
  heights; respect standard desktop spacing so forms, nav and content breathe.
- **Feedback**: toasts, loading states and empty states must work on all sizes.
- **Platform plumbing**: correct <title>, <meta name="description">, viewport,
  favicon and accessible landmarks (header, nav, main, footer).
`;
