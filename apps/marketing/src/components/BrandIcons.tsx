import type { ComponentType } from "react";
import { SiClaude, SiOpenai } from "react-icons/si";

type IconProps = { className?: string };

export function ClaudeIcon({ className }: IconProps) {
  return <SiClaude className={className} aria-hidden="true" />;
}

export function OpenAIIcon({ className }: IconProps) {
  return <SiOpenai className={className} aria-hidden="true" />;
}

export function DeepSeekIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16.93c-3.96-.48-7.05-3.66-7.46-7.66.47-.28 1.01-.44 1.58-.44 1.83 0 3.32 1.49 3.32 3.32 0 .54-.13 1.05-.36 1.5 1.15.7 2.49 1.13 3.92 1.21v2.07zm5.95-6.07c-.46 3.73-3.23 6.74-6.95 7.42v-2.06c1.32-.23 2.53-.78 3.56-1.57-.31-.5-.5-1.09-.5-1.72 0-1.83 1.49-3.32 3.32-3.32.19 0 .38.02.57.05v1.2z" />
    </svg>
  );
}

export function GeminiIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
    </svg>
  );
}

export function GroqIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M10 8L16 12L10 16V8Z" fill="currentColor" />
    </svg>
  );
}

export function OllamaIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 3a7 7 0 0 0-7 7v4a7 7 0 0 0 14 0v-4a7 7 0 0 0-7-7zm-3 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
    </svg>
  );
}

export function OpencodeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <path d="M320 224V352H192V224H320Z" fill="currentColor" opacity="0.22" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ExpoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M2 18h20L12 2 2 18zm10-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-1-3V8h2v4h-2z" />
    </svg>
  );
}

export function FlutterIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M14.314 0L2.3 12 6 15.7 21.686 0h-7.372zm.028 11.286L7.743 17.886l3.7 3.7 6.6-6.6 3.657-3.7h-7.358z" />
    </svg>
  );
}

export function NextjsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.7 14.5l-6-8.5h-1.4v7.4H8V7.5h1.8l5.8 8.3v-8.3h1.3v8.5z" />
    </svg>
  );
}

export function SupabaseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M21.362 9.354H12V.3a.3.3 0 0 0-.535-.205L2.639 12.654A.3.3 0 0 0 2.873 13.15H12v9.054a.3.3 0 0 0 .535.205l8.826-12.559a.3.3 0 0 0-.234-.496z" />
    </svg>
  );
}

export function NeonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2L2 22h20L12 2zm0 4.5l6.5 13H5.5L12 6.5z" />
    </svg>
  );
}

export function CaideIcon({ className }: IconProps) {
  return (
    <div className={`inline-flex items-center justify-center rounded-lg bg-orange-600 font-bold text-white shadow-sm ${className}`}>
      C
    </div>
  );
}
