import { SplitShowcase } from "@/components/SplitShowcase";
import { ScrollReveal } from "@/components/ScrollReveal";
import { ModelPickerMockup } from "@/components/showcase/ModelPickerMockup";
import {
  ClaudeIcon,
  OpenAIIcon,
  DeepSeekIcon,
  GeminiIcon,
  GroqIcon,
  OllamaIcon,
  OpencodeIcon,
  ExpoIcon,
  FlutterIcon,
  NextjsIcon,
} from "@/components/BrandIcons";
import { SUPPORTED_FRAMEWORKS } from "@/data/product";
import { Smartphone, Layers, Globe, Box, Terminal, Cpu } from "lucide-react";

const heading =
  "text-[1.65rem] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2rem]";
const body = "mt-5 max-w-2xl text-[15px] leading-[1.7] text-[var(--text-secondary)] sm:text-[16px]";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

const activeProviders = [
  {
    name: "Anthropic Claude",
    tagline: "Claude 3.7 Sonnet & 3.5 Sonnet with hybrid reasoning and extended thinking.",
    Icon: ClaudeIcon,
    accent: "text-[#D97757]",
    status: "Direct API Key",
  },
  {
    name: "OpenAI",
    tagline: "GPT-4o, o1, and o3-mini models with structured JSON outputs and function calling.",
    Icon: OpenAIIcon,
    accent: "text-[var(--text-primary)]",
    status: "Direct API Key",
  },
  {
    name: "DeepSeek",
    tagline: "DeepSeek R1 reasoning and V3 chat with extraordinary math and logic performance.",
    Icon: DeepSeekIcon,
    accent: "text-blue-500",
    status: "Direct API Key",
  },
  {
    name: "Google Gemini",
    tagline:
      "Gemini 2.5 Pro and 2.5 Flash with 1M+ token context and lightning multimodal inference.",
    Icon: GeminiIcon,
    accent: "text-amber-500",
    status: "Direct API Key",
  },
  {
    name: "Groq",
    tagline: "Llama 3.3 70B and fast open-weights running on ultra-fast LPUs at 500+ tokens/sec.",
    Icon: GroqIcon,
    accent: "text-orange-500",
    status: "Direct API Key",
  },
  {
    name: "Ollama (Offline)",
    tagline: "100% private, local inference on your machine with zero external network calls.",
    Icon: OllamaIcon,
    accent: "text-[var(--text-primary)]",
    status: "Local Daemon",
  },
  {
    name: "OpenCode Zen",
    tagline: "Curated community catalog of open-source models with zero configuration required.",
    Icon: OpencodeIcon,
    accent: "text-[var(--text-primary)]",
    status: "Free Catalog",
  },
  {
    name: "Custom OpenAI Endpoint",
    tagline: "Point to LM Studio, vLLM, LocalAI, or any self-hosted OpenAI-compatible server.",
    Icon: Cpu,
    accent: "text-[var(--text-primary)]",
    status: "Custom URL",
  },
];

export default function Features() {
  const frameworkIcons: Record<string, any> = {
    "react-native": ExpoIcon,
    flutter: FlutterIcon,
    website: NextjsIcon,
    blank: Box,
  };

  return (
    <div>
      {/* SECTION 1: IMMUTABLE FRAMEWORKS */}
      <section
        id="frameworks"
        className="scroll-mt-24 border-t border-[var(--divide)] py-14 sm:py-20"
      >
        <div className={container}>
          <ScrollReveal>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
              01 / Immutable Frameworks
            </p>
            <h2 className={`${heading} mt-3`}>
              One framework chosen at creation. Deep native toolchains.
            </h2>
            <p className={body}>
              Caide avoids generic spaghetti code by enforcing strict architectural boundaries. The
              framework you select configures the system prompt, toolchain verifiers, live
              dev-servers, and native export pipelines specifically for that stack.
            </p>

            <div className="mt-12 grid grid-cols-1 border-t border-[var(--divide)] sm:grid-cols-2">
              {SUPPORTED_FRAMEWORKS.map((fw, idx) => {
                const IconComp = frameworkIcons[fw.id] || Box;
                return (
                  <div
                    key={fw.id}
                    style={{ transitionDelay: `${idx * 60}ms` }}
                    className="group border-b border-[var(--divide)] p-6 transition-all duration-300 hover:bg-[var(--mock-row)] hover:translate-x-1 sm:p-7 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(odd)]:border-[var(--divide)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--block-elevated)] text-[var(--text-primary)] shadow-sm transition-transform duration-300 group-hover:scale-110">
                          <IconComp className="size-[18px]" />
                        </span>
                        <span className="truncate text-[15px] font-medium text-[var(--text-primary)]">
                          {fw.name}
                        </span>
                      </div>
                      <span className="shrink-0 rounded-full border border-sky-500/20 bg-sky-500/5 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 transition-colors group-hover:bg-sky-500/10">
                        {fw.badge}
                      </span>
                    </div>
                    <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                      {fw.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </ScrollReveal>

          <ScrollReveal delay={80}>
            <SplitShowcase
              kicker="Framework Scaffolding"
              title="Start with full native toolchain support"
              description="Create a new React Native Expo project, Flutter mobile app, or Next.js web application. Caide boots your local environment, installs exact dependencies, and spins up the live Metro or Vite watcher automatically."
              reverse
              prominentMedia
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/screenshots/framework-creation.png"
                alt="Caide Framework Scaffolding: Blank, React Native Expo, Flutter, Next.js Website"
                className="block h-auto w-full"
                width={1356}
                height={747}
              />
            </SplitShowcase>
          </ScrollReveal>
        </div>
      </section>

      {/* SECTION 2: BYOK MULTI-MODEL INTELLIGENCE */}
      <section
        id="providers"
        className="scroll-mt-24 border-t border-[var(--divide)] py-14 sm:py-20"
      >
        <div className={container}>
          <ScrollReveal>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
              Provider Portability & BYOK
            </p>
            <h2 className={`${heading} mt-3`}>
              Bring your own keys. Run any frontier or local model.
            </h2>
            <p className={body}>
              Caide operates zero cloud subscription tiers and zero token markups. Connect your
              direct API keys or connect to local Ollama instances. Switch models instantly per
              thread or turn to balance speed, cost, and reasoning depth.
            </p>

            <div className="mt-12 grid grid-cols-1 border-t border-[var(--divide)] sm:grid-cols-2">
              {activeProviders.map(({ name, tagline, Icon, accent, status }, idx) => (
                <div
                  key={name}
                  style={{ transitionDelay: `${idx * 50}ms` }}
                  className="group border-b border-[var(--divide)] p-6 transition-all duration-300 hover:bg-[var(--mock-row)] hover:translate-x-1 sm:p-7 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(odd)]:border-[var(--divide)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--block-elevated)] shadow-sm transition-transform duration-300 group-hover:scale-110">
                        <Icon className={`size-[18px] ${accent}`} />
                      </span>
                      <span className="truncate text-[15px] font-medium text-[var(--text-primary)]">
                        {name}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full border border-sky-500/20 bg-sky-500/5 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 transition-colors group-hover:bg-sky-500/10">
                      {status}
                    </span>
                  </div>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                    {tagline}
                  </p>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal delay={80}>
            <SplitShowcase
              kicker="BYOK Model Hub"
              title="Direct provider connections. Zero gateway limits."
              description="Configure your keys once in Caide secure storage. Switch between Claude 3.7 for deep refactoring, GPT-4o for complex JSON contracts, and local Ollama for offline rapid edits without ever being throttled."
              reverse={false}
            >
              <ModelPickerMockup />
            </SplitShowcase>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
