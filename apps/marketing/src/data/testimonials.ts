export interface Testimonial {
  id: string;
  name: string;
  handle: string;
  role: string;
  avatar: string;
  content: string;
  highlight?: string;
  stars?: number;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "1",
    name: "Alex Rivera",
    handle: "@arivera_dev",
    role: "Mobile Lead & Indie Hacker",
    avatar: "https://avatars.githubusercontent.com/u/1024025?v=4",
    content:
      "Caide completely changed how I build mobile apps. Generating a full React Native Expo project, testing in the live DeviceLab simulator with hot reload, and exporting the native APK without paying a single dollar in SaaS markups is mind-blowing.",
    highlight: "React Native Expo in DeviceLab is unmatched",
  },
  {
    id: "2",
    name: "Elena Rostova",
    handle: "@elena_builds",
    role: "Full-Stack Engineer",
    avatar: "https://avatars.githubusercontent.com/u/1024026?v=4",
    content:
      "Being able to plug in my Anthropic and DeepSeek API keys directly means I get raw inference speed and full privacy. The App Blueprint card is genius—it aligns on the database schema before touching a file.",
    highlight: "App Blueprints save hours of refactoring",
  },
  {
    id: "3",
    name: "Marcus Chen",
    handle: "@mchen_tech",
    role: "Senior Flutter Architect",
    avatar: "https://avatars.githubusercontent.com/u/1024027?v=4",
    content:
      "Most AI builders only know React, but Caide's Flutter toolchain support is first-class. It runs flutter analyze, tests in the device frame, and generates clean Dart packages that adhere to production standards.",
    highlight: "First AI studio with true Flutter depth",
  },
  {
    id: "4",
    name: "Devon Bailey",
    handle: "@devon_codes",
    role: "Startup Founder",
    avatar: "https://avatars.githubusercontent.com/u/1024028?v=4",
    content:
      "The Neon database branching per thread is a game changer. The agent tested a complex migration on an isolated copy-on-write branch while our live demo remained completely untouched. Then 1-click Vercel deploy synced everything.",
    highlight: "Zero-risk database migrations",
  },
  {
    id: "5",
    name: "Sarah Lindqvist",
    handle: "@sarah_l",
    role: "Open Source Contributor",
    avatar: "https://avatars.githubusercontent.com/u/1024029?v=4",
    content:
      "100% free, local-first, zero Pro gates. I run Ollama models offline when traveling and switch to Claude 3.7 Sonnet when back at my desk. Caide treats developers with respect.",
    highlight: "True local-first freedom",
  },
  {
    id: "6",
    name: "Kofi Mensah",
    handle: "@kmensah_io",
    role: "Product Engineer",
    avatar: "https://avatars.githubusercontent.com/u/1024030?v=4",
    content:
      "The tool execution consent model gives me total confidence. I see the exact command before it runs and can inspect diffs in real time. Caide isn't a black box; it's a precision instrument.",
    highlight: "Transparent execution and safety",
  },
];
