// FILE: src/agent/tools/blueprintTools.ts
// Purpose: Blueprint tool for the engine agent loop. Generates a detailed app
// specification before the LLM starts coding.
// Layer: Engine agent tools

import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { defineTool, type ToolDefinition } from "../tool.ts";

export const writeAppBlueprintTool = defineTool({
  name: "write_app_blueprint",
  description: "Generate a detailed app specification (blueprint) before starting development.",
  parameters: z.object({
    appName: z.string().describe("Name of the app"),
    description: z.string().describe("High-level description of what the app does"),
    screens: z.array(z.string()).describe("List of screen names (e.g., ['HomeScreen', 'ProfileScreen', 'SettingsScreen'])"),
    stateManagement: z
      .enum(["riverpod", "bloc", "provider"])
      .default("riverpod")
      .describe("State management choice"),
    features: z
      .array(z.string())
      .optional()
      .describe("Optional list of features/capabilities (e.g., ['dark mode', 'offline support', 'push notifications'])"),
    navigation: z
      .enum(["tabs", "drawer", "stack"])
      .default("tabs")
      .describe("Navigation pattern"),
  }),
  execute(args, context) {
    const screensList = args.screens
      .map((s) => `- **${s}**: Main view for ${s.replace("Screen", "").toLowerCase()} functionality.`)
      .join("\n");
    const widgetTree = args.screens.map((s) => `  - ${s}`).join("\n");
    const featuresList = args.features?.length
      ? args.features.map((f) => `- ${f}`).join("\n")
      : "Standard features";

    const content = `# Blueprint: ${args.appName}

## App Overview
${args.description}

## Screen Inventory
${screensList}

## Widget Tree Sketch
- App (MaterialApp)
  - Navigation (${args.navigation})
${widgetTree}

## State Management Plan
- **Choice:** ${args.stateManagement}
- **Plan:** Use ${args.stateManagement} providers/cubits for handling global and feature-level state.

## Navigation Graph
- **Pattern:** ${args.navigation}
- Links between screens will follow the ${args.navigation} pattern.

## Theme Notes
- Suggested seed color: Indigo/Blue
- Typography: Standard Material 3 TextTheme

## Dependencies List
- flutter (sdk)
- ${args.stateManagement}
- go_router
- google_fonts (optional)

## File Structure Plan
- \`lib/\`
  - \`main.dart\`
  - \`core/\` (theme, constants, routing)
  - \`features/\`
    ${args.screens.map((s) => `- \`${s.toLowerCase()}/\``).join("\n    ")}
      - \`screens/\`
      - \`providers/\`
      - \`widgets/\`

## Features & Capabilities
${featuresList}
`;

    const filePath = path.join(context.appDir, "BLUEPRINT.md");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");

    return content;
  },
});

export const blueprintTools: readonly ToolDefinition<any>[] = [writeAppBlueprintTool];
