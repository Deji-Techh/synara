// FILE: inspirationPrompts.ts
// Purpose: Starter-app inspiration list (donor labels + prompts verbatim).
// Donor: dyad src/prompts/inspiration_prompts.tsx — icon layer adapted:
// donor lucide JSX nodes → Tabler icon names (web renders them via
// @tabler/icons-react; the server stays framework-agnostic).

/** Tabler icon component name (verified against @tabler/icons-react). */
export type InspirationIconName =
  | "IconChefHat"
  | "IconMapPin"
  | "IconHeart"
  | "IconBuildingStore"
  | "IconCurrencyDollar"
  | "IconBarbell"
  | "IconUsers"
  | "IconPhoto"
  | "IconBook"
  | "IconMusic"
  | "IconCalendar"
  | "IconCamera"
  | "IconWand"
  | "IconHome"
  | "IconPalette"
  | "IconSparkles";

export interface InspirationPrompt {
  icon: InspirationIconName;
  label: string;
  prompt: string;
}

export const INSPIRATION_PROMPTS: InspirationPrompt[] = [
  {
    icon: "IconChefHat",
    label: "Pantry recipe planner",
    prompt:
      "Build a pantry recipe planner where I can enter ingredients I already have, get meal ideas, save favorites, and generate a weekly grocery list.",
  },
  {
    icon: "IconMapPin",
    label: "Travel memory map",
    prompt:
      "Build an interactive travel memory map with pinned trips, photo cards, notes, filters by year, and a beautiful timeline of places I have visited.",
  },
  {
    icon: "IconHeart",
    label: "Mood check-in journal",
    prompt:
      "Build a mood check-in journal with daily reflections, emotion tags, streaks, gentle insights, and a calming dashboard that shows patterns over time.",
  },
  {
    icon: "IconBuildingStore",
    label: "Indie shop landing page",
    prompt:
      "Build a polished landing page for an indie online shop with a hero section, featured products, customer quotes, newsletter signup, and a strong call to action.",
  },
  {
    icon: "IconCurrencyDollar",
    label: "Freelance invoice tracker",
    prompt:
      "Build a freelance invoice tracker with client profiles, invoice status, monthly revenue charts, overdue reminders, and a clean dashboard.",
  },
  {
    icon: "IconBarbell",
    label: "Workout streak coach",
    prompt:
      "Build a workout streak coach with weekly plans, exercise cards, progress photos, habit streaks, and encouraging check-ins after each session.",
  },
  {
    icon: "IconUsers",
    label: "Tiny team CRM",
    prompt:
      "Build a lightweight CRM for a small team with contact cards, deal stages, follow-up reminders, notes, and a simple sales pipeline board.",
  },
  {
    icon: "IconPhoto",
    label: "Creative portfolio",
    prompt:
      "Build a visual portfolio for a designer with project case studies, image galleries, testimonials, an about section, and a contact form.",
  },
  {
    icon: "IconBook",
    label: "Study sprint planner",
    prompt:
      "Build a study sprint planner with subjects, timed focus sessions, spaced-review reminders, progress charts, and a daily study agenda.",
  },
  {
    icon: "IconMusic",
    label: "Music discovery log",
    prompt:
      "Build a music discovery log where I can save albums, rate tracks, write listening notes, filter by mood, and see my favorite genres over time.",
  },
  {
    icon: "IconCalendar",
    label: "Event RSVP hub",
    prompt:
      "Build an event RSVP hub with an invitation page, guest list, RSVP statuses, dietary notes, schedule, and a shareable event link.",
  },
  {
    icon: "IconCamera",
    label: "Photo shoot planner",
    prompt:
      "Build a photo shoot planner with mood boards, shot lists, locations, model notes, schedules, and a checklist for gear and props.",
  },
  {
    icon: "IconWand",
    label: "AI writing workspace",
    prompt:
      "Build an AI writing workspace with document cards, tone presets, draft history, quick rewrite actions, and a distraction-free editor.",
  },
  {
    icon: "IconHome",
    label: "Apartment hunt board",
    prompt:
      "Build an apartment hunt board with saved listings, commute notes, rent comparison, must-have filters, viewing schedule, and decision scores.",
  },
  {
    icon: "IconPalette",
    label: "Brand kit generator",
    prompt:
      "Build a brand kit generator where I can enter a business idea and get color palettes, font pairings, logo directions, and sample social posts.",
  },
  {
    icon: "IconSparkles",
    label: "Personal launch page",
    prompt:
      "Build a personal launch page for a new project with a bold hero, waitlist signup, feature teasers, social proof, and a launch countdown.",
  },
];
