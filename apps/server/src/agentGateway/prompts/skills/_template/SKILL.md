---
name: template-skill
description: Atomic skill — one capability, one injection rule. Copy this template via `bun run skill:new --name <kebab-case>`
when_to_use: "Describe the exact slice condition that triggers this skill (e.g. 'building empty states' or 'visual verification of a screen'). Be specific so Router retrieval is precise."
allowed_tools:
  - read
  - grep
context: inline
paths: []
version: 1.0.0
---

# Template Skill — Replace This Heading

## Purpose
One paragraph: what capability this skill teaches the Builder/Verifier and why it matters for perfect.

## Trigger
When to inject: e.g. "Inject for any screen that has an empty or zero state."

## Rules (injected as data, not prose)
- Token rule: `use colorTokens.accent for active nav only`
- Component rule: `emptyState = illustration + bold headline + muted subtext + optional single white pill CTA`
- Failure mode: `returns error if path outside project root — tell model boundary, don't let it discover`

## Examples
- Good: Real content mock with skeleton over spinner
- Bad: Generic lorem ipsum placeholder

## Verifier Checklist
- [ ] Exact token comparison via `design.md` JSON passes
- [ ] No duplicated logic, properly decomposed
