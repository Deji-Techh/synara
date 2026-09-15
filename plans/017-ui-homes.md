# 017 — UI homes: right-dock / Context / composer catalog + plan→agent handoff

## 0. Law

Ported capabilities get V2 surfaces, never V1 visuals. Three hosts only:
right-dock panes (extend, rarely add), composer Context card + triggers,
stacked composer panels/banners/dialogs. Design-system primitives are mandatory
(§4). This plan is the placement authority — domain plans reference it, and any
new UI not listed here needs a 017 amendment first.

## 1. Right-dock pane catalog (13 kinds — `rightDockStore.logic.ts:12-26`)

browser · device (iOS Simulator) · diff · explorer · file (multi-instance, chat-opened
only) · terminal · sidechat · git · pullRequest (context-only) · goals · database ·
publish · project. Do NOT target the unwired legacy `PreviewPanel.tsx`.

### Add-a-pane recipe (touch in order)

1. `rightDockStore.logic.ts` — kind in `RIGHT_DOCK_PANE_KINDS`, identity fields
   (`RightDockPane`/`OpenPaneInput`/`createPane`), `sanitizePersistedPane`,
   singleton vs `MULTI_INSTANCE_PANE_KINDS`, kind-order test.
2. `rightDockStore.ts` — patch-type extension.
3. `rightDockPaneMeta.tsx` — label + `~/lib/icons` glyph, add-menu
   (`RIGHT_DOCK_ADD_MENU_KINDS`), launcher order/labels/gates
   (`resolveRightDockLauncherItems`: `hasWorkspace/hasGitRepository/hasReview/
   hasDeviceSupport` pattern), tab overrides, meta test.
4. `SingleChatSurface.tsx` — lazy import, `renderDockPane` case (Suspense +
   `PanelStateMessage` fallback; threadId/workspaceRoot/projectId; `onClose`;
   `pollingEnabled/queriesEnabled/liveRefreshEnabled` pattern; `preview`-mode honor),
   labels, `handleAddDockPane`, toggles, `useDockPaneRuntimeActivation`, desktop bridges.
5. `lib/dockPaneActivation.ts` — deferred runtime (sockets/streams) and/or
   keep-mounted (scrollback/selection) + preferred width if needed.
6. WS wiring — request/response via the `invokeDatabase` pattern
   (`DatabasePanel.tsx:78-93`); subscriptions via `goalClient`/device-store/
   `gitReactQuery` precedent; auto-open via `HarnessReveals.tsx` (`reveals[].pane`).
7. `/pull-requests` host only if the pane belongs there (default: chat-only).

### Placement map (extend, don't fork)

| Capability | Home |
|---|---|
| Versions history | New `History` section in `git` pane (`GitPanel.tsx:312-358`); per-file viewport reuse |
| Security findings | New `security` pane; interim 4th `Checks` tab on PR panel |
| Release/toolchain/signing | New rows in `publish` + `PreviewStage` release branch; toolchain card by Publish rows |
| Collaboration roster / live agents | `publish` GitHub row / `goals` SubagentsTab |
| Sharing links/QR/preview URLs | `publish` pane (link mirror); stage QR feeds URLs back |
| MCP servers | Extend `project` `McpSection` (bulk enable, per-tool consent) |
| Skills | Extend `project` `SkillsSection` (reserved slot) |
| Env/configure | Promote `project` `EnvironmentSection` read-only → editor |
| Console/build logs | New agent-output tab in `terminal` pane (keep-mounted) + stage terminal branch |
| Visual editing | New `visual-edit` pane + `PreviewStage` select branch |
| Database additions (branches/logs/social-auth/Auth) | New `<section>`s in `database` pane after `ProjectConnectionSection` |

## 2. Composer Context card (`EnvironmentPanel`, title `Context`)

Construction: `ChatView.tsx:11052-11095`, render `:12190`, open-logic
`ChatView.logic.ts:486-574`, visibility flags `appSettings.ts:242-250`.
Sections (top→bottom): Automations · Changes · env/branch pickers · Git actions ·
Local Servers · Usage · Repository · Pull request · Editor · Recap · Pinned ·
Markers · Project instructions · Notepad. Row primitives:
`EnvironmentRow.tsx` (`ENVIRONMENT_ROW_CLASS_NAME`, `EnvironmentLabeledSection`,
`EnvironmentCollapsibleSection`, chevron, dividers).

### Add-a-section recipe

1. `showEnvironmentX` boolean in `appSettings.ts:242-250` + settings UI +
   `settingsSearchIndex.ts` (if toggleable).
2. `environment/EnvironmentXSection.tsx` composing the labeled/collapsible
   primitives; popups via `ComposerPickerMenuPopup`.
3. Extend `EnvironmentPanelProps` (`:75-166`); render with leading-divider
   discipline (`:328-332`); thread into `environmentPanelProps`.

Rule: ambient state lives here; typed input goes through triggers (§3);
transient state stacks above the input (§5 of composer agent findings).

## 3. Composer triggers & menus

Tokenizer `composer-logic.ts:305-401` (`/` slash incl. `/model`, `$` skill,
`@` mention incl. quoted). Portal `ComposerCommandMenuPortal.tsx:23-99`.
Item union `ComposerCommandMenu.tsx:195-280`; builders
`useComposerCommandMenuItems.ts:239-458`; dispatch `ChatView.tsx:10270-10389`.

### Add-item recipes

- `/` command: `BUILT_IN_COMPOSER_SLASH_COMMANDS` + `COMPOSER_SLASH_COMMAND_DEFINITIONS`
  + `commandMenuTitle` + `SLASH_COMMAND_ICONS` + `getAvailableComposerSlashCommands`
  gating + `handleStandaloneSlashCommand` runtime (+ `canOfferX` predicate if
  state-gated). `/goal` subverbs are args-level (`GOAL_SLASH_SUBCOMMANDS`).
- `@` source: ranked list in the mention branch + `groupCommandItems` group +
  `onSelectComposerItem` side-effect (+ union/glyph/meta for new types).
- `$` skill: inject into `skillItems` builders; state in `composerDraft.skills`.
- `@local` filesystem: `ComposerLocalDirectoryMenu` row kinds + activation.
- `+` menu (`ComposerExtrasMenu`): `MenuItem`/`MenuSub` in the popup + callback prop
  (note: currently unwired in `ChatView` — extend the footer attach cluster instead
  until it is rendered).
- Traits sections: `TraitRadioSection` + sticky `commitTrait` pattern.

### Placement map

`@`: files/paths, `@prompt` library (new type + store + expansion), `@media`
(media index + image-chip render), chats, subagents, plugins. `$`: skills
(+ `/` Skills-group discoverability). `/`: new `image` command, restored goal
subverbs (014), fork/review pickers stay. `+`/footer: attach-as-context vs
upload-to-codebase, reference files, generate-image, token toggle, context-picker.

## 4. Design-system primitives (mandatory)

- Header: `DockPaneHeader.tsx:20-46` + `CHAT_SURFACE_HEADER_ROW_CLASS_NAME` +
  `DOCK_HEADER_ICON_BUTTON_CLASS` + `SurfaceTabChip`.
- States: `PanelStateMessage.tsx:16-37` (density/fill); heavy skeletons via
  `DiffPanelShell`.
- Motion: `lib/disclosureMotion.ts:10-72` + `DisclosureRegion`/`DisclosureChevron`
  (220ms ease-out). No hand-rolled keyframes. Context rows use `EnvironmentRow`
  chevron/collapsible.
- Settings-shaped: `SettingsPanelPrimitives.tsx` (`SettingsCard/Section/Row/
  ListRow/EmptyState/SelectPopup`); container `ScrollArea`; rows
  `rounded-lg border border-border`.
- Status: `Badge` variants + `StatusPill` + `ThreadStatusPillChip` + goal dots.
- Cards: `CaideCard + CaideCardHeader + CaideLazyContent`; choice rows
  `ComposerChoiceRow`; error blocks reuse the `ConsentCard` warning pattern.

## 5. Plan→agent handoff spec (the plan-mode→agent-mode system)

Server: `dyad/plan/` (planStore/planTools/blueprintStore) + `gateway` steer;
no `plan:exit` fork semantics missing — this spec closes it.

1. **Accept routing.** `HarnessPlanCard` + `ProposedPlanCard` footers offer
   `Build in new thread` (primary; server forks via `sidechatCreation` then
   steers implementation, file-grounded like V1's `/implement-plan=`) and
   `Build here` (outline; same-thread steer). Persist
   `plan.acceptedTarget: "fork"|"here"` in `harnessStore` for correct wording
   across remounts. Testids `accept-plan-new-thread` / `accept-plan-continue-here`.
2. **Transitioning states.** `plan.status: draft|accepted|building`; `plan_exit`
   renders accepted `CaideBadge` + disabled `Start building (sending…)` wired to
   the send ack (not optimistic-only); follow-up `turn_start` flips to `building`.
3. **Quoted feedback.** Optional quote-prefix textarea on the change-request
   disclosure; submit steers `Plan change request on <120 chars>:\n> …\n\n<feedback>`.
   No annotation DOM port.
4. **Blueprint apply.** Server applies `framework` post-approval before
   `steerOrLaunch`; on conflict, terminal `error{recoverable:true}` + rollback
   `blueprint.approved=false` so the card stays open with inline conflict text.
   Unify edit source to the approval panel's `edits`. No V1 modal port.
5. **Grounding banner.** `ComposerPlanFollowUpBanner` shows `Accepted: <title>`
   while `plan.exited && status!=="building"`.
6. **No plan-specific `/fork`.** V1 had none; proposal 1 covers it (`/fork` stays
   generic; optional autocomplete hint when `plan.exited`).

## 6. Acceptance

- Every 014/013/012/011 UI item lands in its mapped home using §4 primitives;
  no new pane without a 017 amendment; no V1 visual language anywhere.
- Handoff e2e: plan → Build-in-new-thread → implementation turn grounded in the
  accepted plan; quote feedback revises; blueprint conflict rolls back visibly.
