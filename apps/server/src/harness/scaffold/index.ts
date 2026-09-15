import type { ProjectFramework } from "@caide/contracts";
import { scaffoldReactNative } from "./react-native.ts";
import { scaffoldFlutter } from "./flutter.ts";
import { scaffoldWebsite } from "./website.ts";
import { scaffoldBlank } from "./blank.ts";

export * from "./react-native.ts";
export * from "./flutter.ts";
export * from "./website.ts";
export * from "./blank.ts";

export async function scaffoldProject(
  framework: ProjectFramework,
  root: string,
  appName = "CaideApp",
): Promise<string[]> {
  let files: string[];
  switch (framework) {
    case "react-native":
      files = await scaffoldReactNative(root, appName);
      break;
    case "flutter":
      files = await scaffoldFlutter(root, appName);
      break;
    case "website":
      files = await scaffoldWebsite(root, appName);
      break;
    case "blank":
    default:
      files = await scaffoldBlank(root, appName);
      break;
  }
  // Donor arm-at-creation: a fresh scaffold needs its first blueprint, so
  // the first turn on this app arms the approval gate (blueprintStore).
  // Best-effort — a missing marker only skips the gate, never the scaffold.
  try {
    const { stampBlueprintMarker } = await import("../../dyad/plan/blueprintStore.ts");
    stampBlueprintMarker(root);
  } catch {
    // marker stamp must never fail scaffolding
  }
  return files;
}
