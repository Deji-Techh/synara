"use client";

import { useState } from "react";
import { ExpoIcon, FlutterIcon, NextjsIcon, NeonIcon } from "@/components/BrandIcons";
import { GitBranch, Radio, CheckCircle2, FolderGit2 } from "lucide-react";

interface ProjectCard {
  id: string;
  name: string;
  framework: string;
  badge: string;
  threadCount: string;
  branch: string;
  footer: string;
  Icon: typeof ExpoIcon;
  accentBg: string;
  accentColor: string;
  borderGlow: string;
}

const PROJECTS: ProjectCard[] = [
  {
    id: "expo",
    name: "calculator-mobile-app",
    framework: "React Native (Expo)",
    badge: "SDK 52",
    threadCount: "4 threads",
    branch: "feat-haptics",
    footer: "Metro :8081 • Live phone preview",
    Icon: ExpoIcon,
    accentBg: "bg-indigo-500/12",
    accentColor: "text-indigo-500",
    borderGlow: "border-indigo-500/40 shadow-indigo-500/10",
  },
  {
    id: "flutter",
    name: "crypto-portfolio-client",
    framework: "Flutter Mobile",
    badge: "v3.29",
    threadCount: "2 threads",
    branch: "main",
    footer: "Device preview • APK binary ready",
    Icon: FlutterIcon,
    accentBg: "bg-[#02569B]/12",
    accentColor: "text-[#02569B]",
    borderGlow: "border-[#02569B]/40 shadow-[#02569B]/10",
  },
  {
    id: "website",
    name: "caide-marketing-portal",
    framework: "Next.js Web App",
    badge: "App Router",
    threadCount: "3 threads",
    branch: "feature/launch",
    footer: "Vercel synced • Edge runtime",
    Icon: NextjsIcon,
    accentBg: "bg-slate-500/12",
    accentColor: "text-[var(--text-primary)]",
    borderGlow: "border-slate-500/40 shadow-slate-500/10",
  },
  {
    id: "neon",
    name: "neon-serverless-postgres",
    framework: "Database Branch",
    badge: "Neon CoW",
    threadCount: "Isolated DB",
    branch: "replica-calc",
    footer: "Instant branching • 1-click restore",
    Icon: NeonIcon,
    accentBg: "bg-[#00E599]/12",
    accentColor: "text-[#00E599]",
    borderGlow: "border-[#00E599]/40 shadow-[#00E599]/10",
  },
];

export function ProjectThreadsMockup() {
  const [selectedId, setSelectedId] = useState("expo");
  const selected = PROJECTS.find((p) => p.id === selectedId) || PROJECTS[0]!;

  return (
    <div className="w-full space-y-3.5">
      {/* 2x2 Grid of Tactile Project Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROJECTS.map((project) => {
          const isSelected = project.id === selectedId;
          const IconComponent = project.Icon;

          return (
            <button
              key={project.id}
              type="button"
              onClick={() => setSelectedId(project.id)}
              className={`group relative flex flex-col justify-between rounded-2xl p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? `bg-gradient-to-b from-[#1c1d22] to-[#121316] text-white shadow-xl ${project.borderGlow} ring-1 ring-white/15`
                  : "bg-white/80 dark:bg-white/[0.03] backdrop-blur-md text-[var(--text-primary)] border border-black/[0.07] dark:border-white/[0.08] shadow-xs hover:border-black/20 dark:hover:border-white/20 hover:bg-white dark:hover:bg-white/[0.05]"
              }`}
            >
              {/* Header: Icon + Framework Badge + Dot */}
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex size-9 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${
                      isSelected
                        ? `${project.accentBg} ${project.accentColor} shadow-inner`
                        : "bg-black/[0.04] dark:bg-white/[0.08] text-[var(--text-primary)]"
                    }`}
                  >
                    <IconComponent className="size-5" />
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-mono tracking-wide ${
                      isSelected
                        ? "bg-white/10 text-white border border-white/15"
                        : "bg-black/[0.04] dark:bg-white/[0.06] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {project.badge}
                  </span>
                </div>

                {/* Radio Indicator */}
                <div
                  className={`size-3 rounded-full flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-white ring-4 ring-white/20"
                      : "border border-black/20 dark:border-white/20"
                  }`}
                >
                  {isSelected && <div className="size-1 rounded-full bg-black" />}
                </div>
              </div>

              {/* Title & Path */}
              <div className="mt-4">
                <div
                  className={`text-[14.5px] sm:text-[15.5px] font-semibold tracking-tight ${isSelected ? "text-white" : "text-[var(--text-primary)]"}`}
                >
                  {project.name}
                </div>
                <div
                  className={`mt-1 text-[12px] sm:text-[13px] leading-relaxed flex items-center gap-1.5 ${isSelected ? "text-slate-300" : "text-[var(--text-secondary)]"}`}
                >
                  <span>{project.framework}</span>
                  <span>•</span>
                  <span className="font-mono text-[11px]">{project.threadCount}</span>
                </div>
              </div>

              {/* Footer Pill: Branch & Target */}
              <div className="mt-4 flex items-center justify-between">
                <div
                  className={`text-[11px] font-mono flex items-center gap-1.5 ${isSelected ? "text-slate-400" : "text-[var(--text-tertiary)]"}`}
                >
                  <GitBranch className="size-3 shrink-0" />
                  <span>{project.branch}</span>
                </div>
                <span
                  className={`text-[10.5px] font-mono ${
                    isSelected ? "text-emerald-400" : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  Ready
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Workspace Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.02] backdrop-blur-md px-4 py-3 text-[12px]">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <FolderGit2 className="size-3.5" />
          </div>
          <span className="text-[var(--text-secondary)] font-medium">
            Active Workspace:{" "}
            <strong className="text-[var(--text-primary)]">{selected.name}</strong> (
            {selected.footer})
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono">
          <Radio className="size-3 animate-pulse" />
          <span>Context Preserved Across Switches</span>
        </div>
      </div>
    </div>
  );
}
