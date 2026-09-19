import {
  ClaudeIcon,
  OpenAIIcon,
  DeepSeekIcon,
  GeminiIcon,
  GroqIcon,
  OllamaIcon,
  ExpoIcon,
  FlutterIcon,
  NextjsIcon,
  SupabaseIcon,
} from "@/components/BrandIcons";

const marks = [
  {
    name: "Claude 3.7",
    Icon: ClaudeIcon,
    className: "text-[#D97757]",
    rotation: "-rotate-[6deg]",
  },
  {
    name: "OpenAI GPT-4o",
    Icon: OpenAIIcon,
    className: "text-[var(--text-primary)]",
    rotation: "rotate-[4deg]",
  },
  {
    name: "DeepSeek R1",
    Icon: DeepSeekIcon,
    className: "text-[#4D6BFE]",
    rotation: "-rotate-[3deg]",
  },
  {
    name: "Google Gemini",
    Icon: GeminiIcon,
    className: "text-[#1BA1E3]",
    rotation: "rotate-[3deg]",
  },
  {
    name: "Groq",
    Icon: GroqIcon,
    className: "text-[#F54F35]",
    rotation: "-rotate-[4deg]",
  },
  {
    name: "Ollama Local",
    Icon: OllamaIcon,
    className: "text-[var(--text-primary)]",
    rotation: "rotate-[5deg]",
  },
  {
    name: "Expo (React Native)",
    Icon: ExpoIcon,
    className: "text-[var(--text-primary)]",
    rotation: "-rotate-[2deg]",
  },
  {
    name: "Flutter",
    Icon: FlutterIcon,
    className: "text-[#02569B]",
    rotation: "rotate-[4deg]",
  },
  {
    name: "Next.js",
    Icon: NextjsIcon,
    className: "text-[var(--text-primary)]",
    rotation: "-rotate-[3deg]",
  },
  {
    name: "Supabase",
    Icon: SupabaseIcon,
    className: "text-[#3ECF8E]",
    rotation: "rotate-[5deg]",
  },
] as const;

export default function ProviderMarkRow({
  centered = false,
  showLabels = false,
  theme = "light",
}: {
  centered?: boolean;
  showLabels?: boolean;
  theme?: "light" | "dark";
}) {
  const isDark = theme === "dark";

  return (
    <div
      role="list"
      className={`flex flex-wrap items-center gap-2 ${centered ? "justify-center" : ""}`}
      aria-label="Supported AI models and frameworks"
    >
      {marks.map(({ name, Icon, className, rotation }) => (
        <div
          key={name}
          title={name}
          role="listitem"
          className={`inline-flex items-center justify-center rounded-xl transition-all duration-200 hover:scale-105 ${
            isDark
              ? "border border-white/20 bg-white/10 text-white backdrop-blur-md shadow-sm hover:bg-white/20 hover:border-white/40"
              : "border border-black/[0.08] bg-white/80 text-[var(--text-primary)] backdrop-blur-md shadow-sm hover:border-sky-500/30"
          } ${showLabels ? "gap-2 px-3 py-2" : "size-[38px]"} ${rotation}`}
        >
          <Icon
            className={`size-[18px] ${
              isDark &&
              (className.includes("var(--text-primary)") || className.includes("text-[#02569B]"))
                ? "text-white"
                : className
            }`}
          />
          <span
            className={
              showLabels
                ? `text-[11px] font-medium ${isDark ? "text-white/80" : "text-[var(--text-secondary)]"}`
                : "sr-only"
            }
          >
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}
