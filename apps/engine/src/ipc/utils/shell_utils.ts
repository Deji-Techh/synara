export interface SystemShellSpec {
  command: string;
  args: string[];
}

/**
 * Resolves the appropriate shell executable and flag for the host OS.
 * On Windows, defaults to powershell.exe or cmd.exe.
 * On Unix/macOS, defaults to $SHELL or /bin/sh.
 */
export function getSystemShell(rawCommand: string): SystemShellSpec {
  if (process.platform === "win32") {
    const comspec = process.env.COMSPEC || "cmd.exe";
    return {
      command: comspec,
      args: ["/d", "/s", "/c", rawCommand],
    };
  }

  const userShell = process.env.SHELL || "/bin/sh";
  return {
    command: userShell,
    args: ["-c", rawCommand],
  };
}

/**
 * Returns standard non-interactive environment flags to prevent
 * spawned commands from hanging on terminal input prompts.
 */
export function getStandardShellEnv(
  extraEnv?: Record<string, string>,
): Record<string, string> {
  return {
    ...process.env,
    TERM: "dumb",
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    NONINTERACTIVE: "1",
    DEBIAN_FRONTEND: "noninteractive",
    ...extraEnv,
  };
}
