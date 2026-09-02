import * as fs from "node:fs";
import * as path from "node:path";
import { colorTokens, typeScale, componentRules, radius } from "../../design/tokens.ts";

export async function scaffoldReactNative(
  root: string,
  appName = "MyReactNativeApp",
): Promise<string[]> {
  const createdFiles: string[] = [];

  const dirs = [
    root,
    path.join(root, "src"),
    path.join(root, "src", "screens"),
    path.join(root, "src", "components"),
    path.join(root, "src", "design"),
    path.join(root, ".caide"),
  ];

  for (const d of dirs) {
    await fs.promises.mkdir(d, { recursive: true });
  }

  // 1. package.json
  const pkg = {
    name: appName.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
    version: "1.0.0",
    main: "expo/AppEntry.js",
    scripts: {
      start: "expo start",
      android: "expo start --android",
      ios: "expo start --ios",
      web: "expo start --web",
    },
    dependencies: {
      expo: "~52.0.0",
      "expo-status-bar": "~2.0.0",
      react: "18.3.1",
      "react-native": "0.76.0",
      // Web rendering support so `expo start --web` serves a browser preview
      // (rendered inside the device frame).
      "react-native-web": "^0.19.0",
      "react-dom": "18.3.1",
      "@expo/metro-runtime": "~4.0.0",
      "@react-navigation/native": "^7.0.0",
      "@react-navigation/native-stack": "^7.0.0",
      zustand: "^5.0.0",
      "@tanstack/react-query": "^5.0.0",
    },
    devDependencies: {
      "@babel/core": "^7.20.0",
      "@types/react": "~18.3.12",
      typescript: "^5.3.3",
    },
  };

  const write = async (relPath: string, content: string) => {
    const full = path.join(root, relPath);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, content, "utf-8");
    createdFiles.push(relPath);
  };

  await write("package.json", JSON.stringify(pkg, null, 2));

  // 2. app.json
  await write(
    "app.json",
    JSON.stringify(
      {
        expo: {
          name: appName,
          slug: appName.toLowerCase(),
          version: "1.0.0",
          orientation: "portrait",
          userInterfaceStyle: "dark",
          splash: { backgroundColor: "#0D0D0D" },
        },
      },
      null,
      2,
    ),
  );

  // 3. src/design/tokens.ts
  await write(
    "src/design/tokens.ts",
    `export const colorTokens = ${JSON.stringify(colorTokens, null, 2)} as const;\n` +
      `export const typeScale = ${JSON.stringify(typeScale, null, 2)} as const;\n` +
      `export const componentRules = ${JSON.stringify(componentRules, null, 2)} as const;\n` +
      `export const radius = ${JSON.stringify(radius, null, 2)} as const;\n` +
      `export const spacingUnit = 4 as const;\n`,
  );

  // 4. App.tsx
  await write(
    "App.tsx",
    `import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colorTokens, spacingUnit } from './src/design/tokens';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to ${appName}</Text>
      <Text style={styles.subtitle}>Scaffolded with React Native + Expo</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colorTokens.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacingUnit * 4,
  },
  title: {
    color: colorTokens.textPrimary,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacingUnit * 2,
  },
  subtitle: {
    color: colorTokens.textMuted,
    fontSize: 15,
  },
});
`,
  );

  // 5. .caide files
  await write(
    ".caide/framework.json",
    JSON.stringify({ framework: "react-native", appName, createdAt: Date.now() }, null, 2),
  );
  await write(
    ".caide/design-spec.json",
    JSON.stringify({ colorTokens, typeScale, componentRules, radius, spacingUnit: 4 }, null, 2),
  );
  await write(
    ".caide/motion-spec.json",
    JSON.stringify(
      {
        spring: { stiffness: 400, damping: 30 },
        durations: { micro: "150ms", standard: "220ms" },
      },
      null,
      2,
    ),
  );
  await write(
    ".caide/spec.md",
    `# Specification: ${appName}\n\n*Pending specification planning.*\n`,
  );

  // 6. .gitignore
  await write(
    ".gitignore",
    `node_modules/
.expo/
dist/
npm-debug.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision
`,
  );

  return createdFiles;
}
