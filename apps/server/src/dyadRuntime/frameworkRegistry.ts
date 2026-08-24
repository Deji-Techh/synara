import type { ProjectFramework } from "@caide/contracts";

export type FrameworkCapability =
  | "scaffold"
  | "dependencies"
  | "analyze"
  | "test"
  | "preview"
  | "build:web"
  | "build:android"
  | "build:ios";

export interface ProjectFrameworkDefinition {
  readonly id: ProjectFramework;
  readonly label: string;
  readonly description: string;
  /** Stable UI icon key. Rendering libraries stay outside the runtime. */
  readonly icon: ProjectFramework;
  readonly capabilities: ReadonlySet<FrameworkCapability>;
}

const defineFramework = (
  definition: Omit<ProjectFrameworkDefinition, "capabilities"> & {
    readonly capabilities: ReadonlyArray<FrameworkCapability>;
  },
): ProjectFrameworkDefinition => ({
  ...definition,
  capabilities: new Set(definition.capabilities),
});

const definitions = [
  defineFramework({
    id: "blank",
    label: "Blank",
    description: "An empty managed workspace without an assumed application framework.",
    icon: "blank",
    capabilities: ["scaffold"],
  }),
  defineFramework({
    id: "react-native",
    label: "React Native",
    description: "A React Native and Expo mobile application.",
    icon: "react-native",
    capabilities: [
      "scaffold",
      "dependencies",
      "analyze",
      "test",
      "preview",
      "build:android",
      "build:ios",
    ],
  }),
  defineFramework({
    id: "flutter",
    label: "Flutter",
    description: "A Dart and Flutter application for mobile and supported desktop/web targets.",
    icon: "flutter",
    capabilities: [
      "scaffold",
      "dependencies",
      "analyze",
      "test",
      "preview",
      "build:android",
      "build:ios",
    ],
  }),
  defineFramework({
    id: "website",
    label: "Website",
    description: "A browser application using the proven dyad web runtime.",
    icon: "website",
    capabilities: ["scaffold", "dependencies", "analyze", "test", "preview", "build:web"],
  }),
] as const;

export const projectFrameworkRegistry: ReadonlyMap<
  ProjectFramework,
  ProjectFrameworkDefinition
> = new Map(definitions.map((definition) => [definition.id, definition]));

export function getProjectFrameworkDefinition(
  framework: ProjectFramework,
): ProjectFrameworkDefinition {
  const definition = projectFrameworkRegistry.get(framework);
  if (definition === undefined) {
    throw new Error(`Unsupported project framework: ${String(framework)}`);
  }
  return definition;
}

export function frameworkSupports(
  framework: ProjectFramework,
  capability: FrameworkCapability,
): boolean {
  return getProjectFrameworkDefinition(framework).capabilities.has(capability);
}
