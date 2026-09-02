export interface SecurityViolation {
  file: string;
  rule: string;
  severity: "critical" | "high" | "medium";
  message: string;
  snippet?: string;
}

export interface SecurityAuditResult {
  passed: boolean;
  violations: SecurityViolation[];
}

export function auditSecurity(files: Record<string, string>): SecurityAuditResult {
  const violations: SecurityViolation[] = [];

  const secretPatterns = [
    { name: "OpenAI/Provider API Key", regex: /sk-[a-zA-Z0-9_\-]{20,}/g },
    { name: "GitHub Token", regex: /ghp_[a-zA-Z0-9]{20,}/g },
    { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g },
    {
      name: "Hardcoded Secret Variable",
      regex: /const\s+(?:SECRET|PASSWORD|API_KEY|AUTH_TOKEN)\s*=\s*['"][a-zA-Z0-9_\-]{10,}['"]/i,
    },
  ];

  for (const [file, content] of Object.entries(files)) {
    // 1. Secret Key Detection
    for (const pat of secretPatterns) {
      if (pat.regex.test(content)) {
        violations.push({
          file,
          rule: "no_hardcoded_secrets",
          severity: "critical",
          message: `Hardcoded ${pat.name} detected in source code.`,
        });
      }
    }

    // 2. Dynamic Code Execution (eval, Function constructor)
    if (/\beval\s*\(/.test(content) || /new\s+Function\s*\(/.test(content)) {
      violations.push({
        file,
        rule: "no_eval_or_dynamic_code",
        severity: "critical",
        message: "Dynamic code execution via eval() or new Function() is strictly forbidden.",
      });
    }

    // 3. Unsanitized HTML Injection
    if (
      content.includes("dangerouslySetInnerHTML") &&
      !content.includes("sanitize") &&
      !content.includes("DOMPurify")
    ) {
      violations.push({
        file,
        rule: "no_unsanitized_html",
        severity: "critical",
        message: "dangerouslySetInnerHTML must be sanitized using DOMPurify.",
      });
    }

    // 4. Insecure HTTP API Endpoints
    const httpMatch = content.match(/fetch\s*\(\s*['"]http:\/\/[^'"]+['"]/);
    if (httpMatch) {
      violations.push({
        file,
        rule: "https_only",
        severity: "high",
        message: "Insecure HTTP endpoint detected. All remote API calls must use HTTPS.",
        snippet: httpMatch[0],
      });
    }

    // 5. Sensitive Data Logging
    if (/console\.log\s*\([^)]*(?:password|token|apiKey|secret|creditCard)[^)]*\)/i.test(content)) {
      violations.push({
        file,
        rule: "no_sensitive_logging",
        severity: "medium",
        message: "Potential sensitive credential logging to console.",
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
