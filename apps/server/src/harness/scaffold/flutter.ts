import * as fs from "node:fs";
import * as path from "node:path";
import { colorTokens, typeScale, componentRules, radius } from "../../design/tokens.ts";

export async function scaffoldFlutter(root: string, appName = "MyFlutterApp"): Promise<string[]> {
  const createdFiles: string[] = [];

  const dirs = [
    root,
    path.join(root, "lib"),
    path.join(root, "lib", "screens"),
    path.join(root, "lib", "theme"),
    path.join(root, ".caide"),
  ];

  for (const d of dirs) {
    await fs.promises.mkdir(d, { recursive: true });
  }

  const write = async (relPath: string, content: string) => {
    const full = path.join(root, relPath);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, content, "utf-8");
    createdFiles.push(relPath);
  };

  // 1. pubspec.yaml
  await write(
    "pubspec.yaml",
    `name: ${appName.toLowerCase().replace(/[^a-z0-9_]/g, "_")}
description: "${appName} built with Caide Flutter engine."
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.0
  go_router: ^14.0.0
  dio: ^5.4.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
`,
  );

  // 2. lib/theme/tokens.dart
  await write(
    "lib/theme/tokens.dart",
    `import 'package:flutter/material.dart';

class ColorTokens {
  static const background = Color(0xFF0D0D0D);
  static const backgroundAlt = Color(0xFF121212);
  static const textPrimary = Color(0xFFFFFFFF);
  static const textMuted = Color(0xFF9CA3AF);
  static const accent = Color(0xFFE8493C);
  static const surface = Color(0xFF1A1A1A);
  static const border = Color(0xFF2A2A2A);
  static const error = Color(0xFFEF4444);
}
`,
  );

  // 3. lib/main.dart
  await write(
    "lib/main.dart",
    `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'theme/tokens.dart';

void main() {
  runApp(const ProviderScope(child: CaideApp()));
}

class CaideApp extends StatelessWidget {
  const CaideApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '${appName}',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: ColorTokens.background,
      ),
      home: Scaffold(
        body: Center(
          child: Text(
            'Welcome to ${appName}',
            style: const TextStyle(
              color: ColorTokens.textPrimary,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ),
    );
  }
}
`,
  );

  // 4. .caide files
  await write(
    ".caide/framework.json",
    JSON.stringify({ framework: "flutter", appName, createdAt: Date.now() }, null, 2),
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
  await write(".caide/spec.md", `# Specification: ${appName}\n\n*Pending specification planning.*\n`);

  // 5. .gitignore
  await write(
    ".gitignore",
    `.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.packages
build/
ios/Flutter/.last_build_id
`,
  );

  return createdFiles;
}
