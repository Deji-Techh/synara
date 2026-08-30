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
  switch (framework) {
    case "react-native":
      return await scaffoldReactNative(root, appName);
    case "flutter":
      return await scaffoldFlutter(root, appName);
    case "website":
      return await scaffoldWebsite(root, appName);
    case "blank":
    default:
      return await scaffoldBlank(root, appName);
  }
}
