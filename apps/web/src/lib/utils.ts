export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function isMacPlatform(platform: string): boolean {
  return /mac|darwin/i.test(platform);
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export const isMac = typeof navigator !== "undefined" && isMacPlatform(navigator.platform);
