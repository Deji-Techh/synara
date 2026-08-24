import { Schema } from "effect";

export const PROJECT_FRAMEWORKS = ["blank", "react-native", "flutter", "website"] as const;

export const ProjectFramework = Schema.Literals(PROJECT_FRAMEWORKS);
export type ProjectFramework = typeof ProjectFramework.Type;

export const ProjectFrameworkSchemaVersion = Schema.Literal(1);

export const ProjectFrameworkSelection = Schema.Struct({
  framework: ProjectFramework,
  schemaVersion: ProjectFrameworkSchemaVersion,
});
export type ProjectFrameworkSelection = typeof ProjectFrameworkSelection.Type;
