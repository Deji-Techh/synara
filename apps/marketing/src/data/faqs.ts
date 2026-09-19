export interface FAQItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: "What is Caide?",
    answer:
      "Caide is an open-source, local-first workspace for building production-grade full-stack applications with AI. Unlike general-purpose code assistants or chatbots, Caide manages the complete app development lifecycle: scaffolding framework projects (React Native, Flutter, Next.js), streaming agent code changes, reviewing architecture with App Blueprints, testing in DeviceLab with live hot-reloading, and deploying production builds.",
  },
  {
    question: "Is Caide really 100% free?",
    answer:
      "Yes. Caide has no Pro plans, no paywalls, no monthly subscription, and no hosted gateway token surcharges. You connect directly to model providers (Anthropic, OpenAI, DeepSeek, Gemini, Groq, or local Ollama) using your own API keys, paying raw provider rates directly or running free offline models.",
  },
  {
    question: "How do API keys and AI models work?",
    answer:
      "Your API keys are stored securely on your local machine using your operating system's credential store (or encrypted local storage). Caide communicates directly with provider endpoints over HTTPS without routing your prompts or code through proprietary intermediary servers.",
  },
  {
    question: "What frameworks does Caide support?",
    answer:
      "Caide currently provides deep, first-class support for four immutable project types: React Native (Expo) for iOS/Android/Web, Flutter for cross-platform native apps, Website (Next.js / Vite) for modern web applications, and Blank for unconstrained custom codebases.",
  },
  {
    question: "Can I build real iOS and Android apps?",
    answer:
      "Absolutely. In React Native and Flutter projects, Caide manages the local development servers, streams logs, provides responsive device frames (iPhone and Android) with mobile QR code testing, and triggers native production builds (APK, AAB, and IPA artifacts) using your local toolchains.",
  },
  {
    question: "What are App Blueprints and Questionnaire cards?",
    answer:
      "Before writing code for complex features, Caide's agent can generate interactive App Blueprints outlining routes, data models, and component hierarchies, alongside 3-question questionnaires to align on technical tradeoffs with you before committing changes.",
  },
  {
    question: "How does database branching with Neon and Supabase work?",
    answer:
      "Caide integrates directly with Neon serverless Postgres and Supabase. When working on feature threads, Caide can spin up isolated, copy-on-write database branches in seconds so your agent can test migrations without affecting production data.",
  },
  {
    question: "Where is my source code stored?",
    answer:
      "Your source code remains entirely on your machine in standard local directories. Caide creates standard Git repositories that you can open in any editor, push to GitHub, or build with standard CLI tools at any time.",
  },
];
