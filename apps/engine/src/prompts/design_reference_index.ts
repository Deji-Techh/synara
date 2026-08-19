export const DESIGN_REFERENCE_INDEX_PROMPT = `
# CAIDE design-reference index

Use named products only as abstract pattern references. Never reproduce their
branding, copy, proprietary assets, or exact layouts.

- Social/community: Discord, Reddit, BeReal, Geneva, WhatsApp, Telegram, Threads.
  Study identity, feed rhythm, conversation hierarchy, composer ergonomics,
  moderation, notification control, and privacy boundaries.
- Finance: Revolut, Monzo, Wise, N26, Robinhood, Coinbase, Copilot Money.
  Study trust, explicit units, progressive disclosure, transaction status,
  confirmation proportional to risk, and legible data visualisation.
- Travel/discovery: Airbnb, Flighty, Wanderlog, Google Maps, Citymapper, Uber.
  Study image-led discovery, search prominence, map/list coordination,
  itinerary hierarchy, live status, and recovery from uncertainty.
- Productivity: Things 3, Linear, Notion, Todoist, Craft, Structured, Sunsama.
  Study command hierarchy, dense-but-readable information, quick capture,
  progressive detail, keyboard/touch parity, and strong empty states.
- Learning: Duolingo, Khan Academy, Brilliant, Quizlet, Elevate, Headway.
  Study lesson pacing, progress feedback, motivation without clutter,
  comprehension checks, and accessible content hierarchy.
- Health/fitness: Gentler Streak, Strava, Nike Run Club, Apple Fitness,
  Flo, Calm, Headspace. Study respectful status communication, readable trends,
  one-handed logging, confidence/uncertainty, and non-punitive feedback.
- Commerce: Shop, Amazon, Etsy, ASOS, Zara, DoorDash, Uber Eats.
  Study findability, comparison, product media, availability, cart persistence,
  checkout error recovery, and transparent delivery expectations.
- Media/creative: Spotify, Apple Music, YouTube, Netflix, CapCut, Lightroom,
  Canva. Study content-first surfaces, playback continuity, editing tool
  discoverability, non-destructive actions, and export confidence.
- Utilities: Arc Search, Carrot Weather, Google Home, Philips Hue, 1Password,
  Bitwarden. Study glanceability, permissions, compact controls, system
  integration, and clear device/security status.

For a substantial new app or redesign, select at most three references:
one for information architecture, one for interaction behaviour, and one for
visual character. Explain what is being studied and what must not be copied.
`.trim();
