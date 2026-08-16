# Top Welcome Screens — animated splash & onboarding craft reference

Distilled from the open-source research library [Appllama top-welcome-screens]
(https://github.com/Appllama/top-welcome-screens), a collection of 10 animated
splash, loading, and welcome-screen UI studies recreated in Expo / React
Native (Expo SDK 57, RN 0.86, react-native-reanimated, expo-image,
expo-font, expo-asset, expo-status-bar). The original reference clips and
stills are NOT redistributed; the following are the calibrated craft
contracts extracted from the implementation, its `MOTION_SPEC.md`, and its
audited generated-asset inventory.

> Educational reference only. Trade dress (names, logos, mascots, phrases)
> belongs to the studied products. Any welcome-screen work in Caide apps must
> use original branding and generated assets; never reproduce third-party
> marks from the study screens.

## The ten studies at a glance

| Study | Entrance | Signature motion worth borrowing |
| --- | --- | --- |
| Duolingo-inspired | 2.667 s | staged owl blinks (0.400–0.567, 2.467–2.600), splash mark scales down, circular-mask page expansion, strong ease-out |
| Strava-inspired | 6.600 s | static brand splash then a spinner rotating below the logo (0.867–5.133), hard cut to final screen |
| MyFitnessPal-inspired | 8.867 s | blue loader copy swaps Updating… → Loading… with no dissolve (2.900), hard cut to a hero carousel |
| Perplexity-inspired | Final state | No entrance: deterministic final login screen (Apple/Google/email rows, SSO, small legal links) |
| Yazio-inspired | 1.733 s | Staggered damped-spring entrance of icon tiles (carrot, apples, clock, calendar, chef hat) into the shell |
| onX Hunt-inspired | 1.467 s | Static orange-red brand splash, hard cut to the sign-in page |
| Speak & Learn-inspired | 4.940 s | Layered vertical logo mark rotates and grows in, speech-bubble objects grow/slide in and fade, welcome page slides in with strong ease-out |
| Hallow-inspired | 4.500 s | Splash color interpolation (e.g. #9F3BE9 → #9240E0), loader-dot scale pulse, whole loader dissolves into final page |
| SCRL-inspired | 1.999 s | Static black splash, hard cut to skeleton/home; background, awards, copy, CTA reveal with separate ease-out opacity curves (1.300–1.800) |
| Speak: Language Learning-inspired | 5.070 s | Launch page dissolves to loading field, page-to-page horizontal slide (3.267–3.533), final CTA fades in last (3.800–4.400) |

## Craft contracts (apply to every welcome screen)

1. **Canvas and responsiveness:** author layouts on a 640×1385 reference
   canvas; iPhone-ratio screens use a full-bleed cover transform, materially
   different portrait ratios use a uniform contain transform.
2. **Authored timing beats:** use the measured intervals above — including
   hard cuts where the reference has them, and stagger separately-entered
   elements with damped springs rather than uniform delays.
3. **Reduced motion:** listen to the device preference; render the final
   state immediately (no timeline) when reduced motion is on.
4. **Interaction gating:** buttons stay inert and absent from the
   accessibility tree until their visible surface has appeared.
5. **Asset loading:** preload all fonts and image modules before the animated
   React layer is shown; keep the native splash visible until assets are
   ready for a seamless handoff.
6. **Status bar:** the device owns the real status bar; no simulated
   recorder chrome.
7. **Semantic actions:** every provider link / primary / secondary / close
   action flows only through one typed `onActionPress`-style handler with
   IDs like `duolingo.get-started`, `strava.join-for-free`,
   `speak-learn.lets-go`; buttons must not dead-end.
8. **Props:** sprinkle the profile surface with:
   - dependency-free replay of the entrance (`replayKey`)
   - deterministic final-state render (`autoplay: false`)
9. **Branding:** replace all third-party names, logos, phrases, images, and
   artwork with the app's own identity before public or commercial release.

## Fitting the study to the product

- Utility / habit app (Strava, MyFitnessPal): quiet splash + spinner + hard
  cut — fast, no dancing mascot.
- Playful consumer app (Duolingo, Speak & Learn): animated mascot/character
  with blinks + grows, full choreography.
- Calm / wellness (Hallow, Yazio): color interpolation, spring-stagger icon
  tiles, soft dissolves.
- Focus/login-first (Perplexity, onX Hunt): instant deterministic final
  state; motion budget stays zero — differentiate by spacing and hierarchy.
- Socials / feed apps (SCRL): splash + skeleton state + staggered
  opacity-reveal of real content areas.
- Pager-style education (Speak Language): horizontal page carousel then a
  single strong CTA at the very end.

## Ambience

Projects these studies alongside: preanimated subject matter; keep the
splash ≤ ~3 s; never block the user after the entrance; the welcome screen
is advertising for the product's personality — match the brand glyph,
typography, and color system already in the app.