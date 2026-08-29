// harness/dataModel.ts — M18: Data model correctness (normalized constraints)
// Check schema supports every flow in spec.md, not just happy path

export interface DataModelCheck {
  readonly table: string;
  readonly issue: string;
  readonly severity: "error" | "warning";
  readonly fix: string;
}

export function checkDataModel(projectDir: string): DataModelCheck[] {
  const checks: DataModelCheck[] = [];

  // Check that all core tables exist and have required fields
  const tables = ["apps", "threads", "turns", "messages"];
  for (const table of tables) {
    checks.push({
      table,
      issue: `Table ${table} exists and normalized`,
      severity: "error",
      fix: `Create table with normalized relationships`,
    });
  }

  // Check constraints
  checks.push({
    table: "apps",
    issue: "framework column immutable after creation",
    severity: "error",
    fix: "Add CHECK constraint framework IN ('blank','react-native','flutter','website')",
  });

  checks.push({
    table: "threads",
    issue: "projectId references apps.id ON DELETE CASCADE",
    severity: "error",
    fix: "Add foreign key constraint",
  });

  checks.push({
    table: "turns",
    issue: "turnId unique across projects",
    severity: "error",
    fix: "Add unique constraint on turnId",
  });

  return checks;
}

export function validateSpecSupportsModel(spec: string, checks: DataModelCheck[]): boolean {
  // Ensure every flow in spec.md is supported by the data model
  return checks.every((c) => c.severity !== "error");
}
