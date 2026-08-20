export type SandboxFailureCategory = "syntax" | "host-function" | "timeout" | "runtime";

export function classifySandboxFailure(errorMessage: string): SandboxFailureCategory {
  if (/timed out|timeout/i.test(errorMessage)) {
    return "timeout";
  }

  if (
    /path is not a file|file not found|directory not found|protected path|outside the app|host call|host function|capability/i.test(
      errorMessage,
    )
  ) {
    return "host-function";
  }

  if (
    /unsupported syntax|syntax\s*error|syntaxerror|parse\s*error|unexpected token|unexpected end|unsupported (?:statement|expression|operator|construct|feature|built-in)/i.test(
      errorMessage,
    )
  ) {
    return "syntax";
  }

  return "runtime";
}

function getFailureHeading(category: SandboxFailureCategory): string {
  switch (category) {
    case "syntax":
      return "This script uses syntax or language features that the sandbox does not support.";
    case "host-function":
      return "A sandbox host function failed while the script was running.";
    case "timeout":
      return "The sandbox script timed out before it completed.";
    default:
      return "The sandbox script failed while it was running.";
  }
}

function getFailureHint(
  category: SandboxFailureCategory,
  errorMessage: string,
): string | undefined {
  if (/path is not a file/i.test(errorMessage)) {
    return (
      'list_files() can return directory entries ending in "/". ' +
      "Skip those entries or recurse into them before calling read_file() or file_stats()."
    );
  }

  if (category === "timeout") {
    return "Split the operation into smaller reads or aggregations, or use the worker execution thread for compute-heavy work.";
  }

  if (category === "syntax") {
    return "Rewrite the script using the supported MustardScript subset described in the tool instructions.";
  }

  return undefined;
}

export function buildSandboxFailureMessage(params: {
  script: string;
  errorMessage: string;
}): string {
  const category = classifySandboxFailure(params.errorMessage);
  const hint = getFailureHint(category, params.errorMessage);
  const sections = [
    getFailureHeading(category),
    "",
    "Script:",
    params.script,
    "",
    "Original error:",
    params.errorMessage,
  ];

  if (hint) {
    sections.push("", "How to recover:", hint);
  }

  return sections.join("\n");
}
