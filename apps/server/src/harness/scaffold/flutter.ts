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

  // 3. lib/main.dart + router + tabbed home (mobile contract: bottom tabs)
  await write(
    "lib/main.dart",
    `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router.dart';
import 'theme/tokens.dart';

void main() {
  runApp(const ProviderScope(child: CaideApp()));
}

class CaideApp extends StatelessWidget {
  const CaideApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: '${appName}',
      debugShowCheckedModeBanner: false,
      theme: buildCaideTheme(),
      routerConfig: caideRouter,
    );
  }
}
`,
  );

  // 3b. lib/router.dart — bottom-tab shell with 2+ tabs (mobile contract)
  await write(
    "lib/router.dart",
    `import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'screens/settings_screen.dart';

final caideRouter = GoRouter(
  initialLocation: '/home',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) {
        return ScaffoldWithTabs(navigationShell: navigationShell);
      },
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/home', builder: (context, state) => const HomeScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/settings', builder: (context, state) => const SettingsScreen())],
        ),
      ],
    ),
  ],
);

class ScaffoldWithTabs extends StatelessWidget {
  const ScaffoldWithTabs({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  void _goBranch(int index) {
    navigationShell.goBranch(index, initialLocation: index == navigationShell.currentIndex);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: _goBranch,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }
}
`,
  );

  // 3c. sample screens with empty-state-ready structure
  await write(
    "lib/screens/home_screen.dart",
    `import 'package:flutter/material.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('${appName}')),
      body: const Center(
        child: Text('No items yet — create your first one to get started.'),
      ),
    );
  }
}
`,
  );
  await write(
    "lib/screens/settings_screen.dart",
    `import 'package:flutter/material.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: const [
          ListTile(leading: Icon(Icons.palette_outlined), title: Text('Appearance')),
          ListTile(leading: Icon(Icons.info_outlined), title: Text('About')),
        ],
      ),
    );
  }
}
`,
  );

  // 3d. theme wiring off the token file
  await write(
    "lib/theme/app_theme.dart",
    `import 'package:flutter/material.dart';
import 'tokens.dart';

ThemeData buildCaideTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: ColorTokens.accent,
    brightness: Brightness.dark,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: ColorTokens.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: ColorTokens.background,
      foregroundColor: ColorTokens.textPrimary,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: ColorTokens.surface,
      indicatorColor: ColorTokens.accent.withValues(alpha: 0.24),
    ),
  );
}
`,
  );

  // 3e. analysis options (lints on from day one)
  await write(
    "analysis_options.yaml",
    `include: package:flutter_lints/flutter.yaml

linter:
  rules:
    prefer_single_quotes: true
    require_trailing_commas: true
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
  await write(
    ".caide/spec.md",
    `# Specification: ${appName}\n\n*Pending specification planning.*\n`,
  );

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
