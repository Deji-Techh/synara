import * as fs from "node:fs";
import * as path from "node:path";
import { colorTokens, typeScale, componentRules, radius } from "../../design/tokens.ts";

export async function scaffoldFlutter(root: string, appName = "MyFlutterApp"): Promise<string[]> {
  const createdFiles: string[] = [];
  const pkgName = appName.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  const dirs = [
    root,
    path.join(root, "lib"),
    path.join(root, "lib", "screens"),
    path.join(root, "lib", "theme"),
    path.join(root, "lib", "widgets"),
    path.join(root, "lib", "providers"),
    path.join(root, "lib", "services"),
    path.join(root, "assets", "images"),
    path.join(root, "assets", "icons"),
    path.join(root, "test"),
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
    `name: ${pkgName}
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
  connectivity_plus: ^6.0.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
  assets:
    - assets/images/
    - assets/icons/
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
  static const success = Color(0xFF22C55E);
}

class Spacing {
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
}
`,
  );

  // 3. lib/main.dart — ProviderScope + error surface + router
  await write(
    "lib/main.dart",
    `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/theme_mode.dart';
import 'router.dart';
import 'theme/app_theme.dart';
import 'theme/tokens.dart';
import 'widgets/offline_banner.dart';

void main() {
  ErrorWidget.builder = (details) {
    return const Material(
      color: ColorTokens.background,
      child: Center(
        child: Padding(
          padding: EdgeInsets.all(Spacing.lg),
          child: Text(
            'Something went wrong. Restart the preview to try again.',
            style: TextStyle(color: ColorTokens.textPrimary),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  };
  runApp(const ProviderScope(child: CaideApp()));
}

class CaideApp extends ConsumerWidget {
  const CaideApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp.router(
      title: '${appName}',
      debugShowCheckedModeBanner: false,
      theme: buildCaideTheme(Brightness.light),
      darkTheme: buildCaideTheme(Brightness.dark),
      themeMode: themeMode,
      routerConfig: caideRouter,
      builder: (context, child) => Column(
        children: [
          const OfflineBanner(),
          Expanded(child: child ?? const SizedBox.shrink()),
        ],
      ),
    );
  }
}
`,
  );

  // 4. lib/router.dart — bottom-tab shell + login modal + 404
  await write(
    "lib/router.dart",
    `import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/login_screen.dart';

final caideRouter = GoRouter(
  initialLocation: '/home',
  errorBuilder: (context, state) => const NotFoundScreen(),
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
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
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

class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Not found')),
      body: Center(
        child: FilledButton(
          onPressed: () => context.go('/home'),
          child: const Text('Go home'),
        ),
      ),
    );
  }
}
`,
  );

  // 5. screens
  await write(
    "lib/screens/home_screen.dart",
    `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_session.dart';
import '../theme/tokens.dart';
import '../widgets/app_card.dart';
import '../widgets/app_button.dart';
import '../widgets/empty_state.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final email = ref.watch(authSessionProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('${appName}')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          const AppCard(
            title: 'Design system',
            body: 'Buttons, fields, cards, and rows live in lib/widgets/ — theme tokens only.',
          ),
          const SizedBox(height: Spacing.md),
          if (email != null)
            AppCard(title: 'Signed in', body: email)
          else
            EmptyState(
              title: 'Not signed in',
              hint: 'Sign in to sync your data across devices.',
              actionLabel: 'Sign in',
              onAction: () => context.push('/login'),
            ),
          const SizedBox(height: Spacing.md),
          AppButton(label: 'Open settings', variant: AppButtonVariant.outline, onPressed: () => context.go('/settings')),
        ],
      ),
    );
  }
}
`,
  );

  await write(
    "lib/screens/settings_screen.dart",
    `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_session.dart';
import '../providers/theme_mode.dart';
import '../widgets/settings_row.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final session = ref.watch(authSessionProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          SettingsRow(
            icon: Icons.palette_outlined,
            title: 'Appearance',
            detail: themeMode == ThemeMode.light ? 'Light' : 'Dark',
            onTap: () => ref.read(themeModeProvider.notifier).toggle(),
          ),
          if (session.valueOrNull != null)
            SettingsRow(
              icon: Icons.logout_outlined,
              title: 'Sign out (${"$"}{session.valueOrNull})',
              onTap: () => ref.read(authSessionProvider.notifier).signOut(),
            ),
        ],
      ),
    );
  }
}
`,
  );

  await write(
    "lib/screens/login_screen.dart",
    `import 'package:flutter/material.dart';
import '../widgets/login_form.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: const SingleChildScrollView(
        padding: EdgeInsets.all(16),
        child: LoginForm(),
      ),
    );
  }
}
`,
  );

  // 6. widget kit — token-driven Material3
  await write(
    "lib/widgets/app_button.dart",
    `import 'package:flutter/material.dart';
import '../theme/tokens.dart';

enum AppButtonVariant { primary, outline, danger }

class AppButton extends StatelessWidget {
  const AppButton({super.key, required this.label, required this.onPressed, this.variant = AppButtonVariant.primary});

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;

  @override
  Widget build(BuildContext context) {
    final style = ElevatedButton.styleFrom(
      backgroundColor: switch (variant) {
        AppButtonVariant.primary => ColorTokens.accent,
        AppButtonVariant.outline => Colors.transparent,
        AppButtonVariant.danger => ColorTokens.error,
      },
      foregroundColor: Colors.white,
      minimumSize: const Size(48, 48),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: variant == AppButtonVariant.outline
            ? const BorderSide(color: ColorTokens.border)
            : BorderSide.none,
      ),
    );
    return ElevatedButton(style: style, onPressed: onPressed, child: Text(label));
  }
}
`,
  );

  await write(
    "lib/widgets/app_text_field.dart",
    `import 'package:flutter/material.dart';
import '../theme/tokens.dart';

class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.error,
    this.controller,
    this.keyboardType,
    this.obscureText = false,
    this.textInputAction,
    this.onSubmitted,
  });

  final String label;
  final String? error;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final bool obscureText;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: ColorTokens.textMuted, fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(height: Spacing.xs),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscureText,
          textInputAction: textInputAction,
          onSubmitted: onSubmitted,
          style: const TextStyle(color: ColorTokens.textPrimary),
          decoration: InputDecoration(
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: ColorTokens.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: error != null ? ColorTokens.error : ColorTokens.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: ColorTokens.accent),
            ),
            errorText: error,
            contentPadding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.md),
          ),
        ),
      ],
    );
  }
}
`,
  );

  await write(
    "lib/widgets/app_card.dart",
    `import 'package:flutter/material.dart';
import '../theme/tokens.dart';

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: ColorTokens.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: ColorTokens.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(Spacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: ColorTokens.textPrimary)),
            const SizedBox(height: Spacing.xs),
            Text(body, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: ColorTokens.textMuted)),
          ],
        ),
      ),
    );
  }
}
`,
  );

  await write(
    "lib/widgets/settings_row.dart",
    `import 'package:flutter/material.dart';
import '../theme/tokens.dart';

class SettingsRow extends StatelessWidget {
  const SettingsRow({super.key, required this.icon, required this.title, this.detail, this.onTap});

  final IconData icon;
  final String title;
  final String? detail;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: ColorTokens.textMuted),
      title: Text(title, style: const TextStyle(color: ColorTokens.textPrimary)),
      subtitle: detail != null ? Text(detail!, style: const TextStyle(color: ColorTokens.textMuted)) : null,
      trailing: const Icon(Icons.chevron_right, color: ColorTokens.textMuted),
      onTap: onTap,
    );
  }
}
`,
  );

  await write(
    "lib/widgets/empty_state.dart",
    `import 'package:flutter/material.dart';
import '../theme/tokens.dart';
import 'app_button.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, this.hint, this.actionLabel, this.onAction});

  final String title;
  final String? hint;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(Spacing.xl),
      decoration: BoxDecoration(
        border: Border.all(color: ColorTokens.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          const Icon(Icons.inbox_outlined, color: ColorTokens.textMuted, size: 28),
          const SizedBox(height: Spacing.sm),
          Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: ColorTokens.textPrimary)),
          if (hint != null) ...[
            const SizedBox(height: Spacing.xs),
            Text(hint!, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: ColorTokens.textMuted), textAlign: TextAlign.center),
          ],
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: Spacing.md),
            AppButton(label: actionLabel!, variant: AppButtonVariant.outline, onPressed: onAction),
          ],
        ],
      ),
    );
  }
}
`,
  );

  await write(
    "lib/widgets/loading.dart",
    `import 'package:flutter/material.dart';
import '../theme/tokens.dart';

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: ColorTokens.accent),
          if (message != null) ...[
            const SizedBox(height: 12),
            Text(message!, style: const TextStyle(color: ColorTokens.textMuted)),
          ],
        ],
      ),
    );
  }
}
`,
  );

  await write(
    "lib/widgets/offline_banner.dart",
    `import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../theme/tokens.dart';

/// Offline detection banner (mobile-specific): shows while the device has
/// no route, hides on reconnect. Mounted once in main.dart.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ConnectivityResult>>(
      stream: Connectivity().onConnectivityChanged,
      builder: (context, snapshot) {
        final results = snapshot.data ?? const [ConnectivityResult.mobile];
        final offline = results.contains(ConnectivityResult.none);
        if (!offline) return const SizedBox.shrink();
        return Container(
          width: double.infinity,
          color: ColorTokens.error,
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: const Text(
            'No connection — changes will sync when you are back online.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white, fontSize: 12),
          ),
        );
      },
    );
  }
}
`,
  );

  await write(
    "lib/widgets/login_form.dart",
    `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_session.dart';
import '../theme/tokens.dart';
import 'app_button.dart';
import 'app_text_field.dart';

class LoginForm extends ConsumerStatefulWidget {
  const LoginForm({super.key});

  @override
  ConsumerState<LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends ConsumerState<LoginForm> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _emailError;
  String? _passwordError;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String? _validateEmail(String value) {
    if (!RegExp(r'^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$').hasMatch(value.trim())) {
      return 'Enter a valid email address';
    }
    return null;
  }

  void _submit() {
    final emailError = _validateEmail(_email.text);
    final passwordError = _password.text.length < 8 ? 'Password needs at least 8 characters' : null;
    setState(() {
      _emailError = emailError;
      _passwordError = passwordError;
    });
    if (emailError != null || passwordError != null) return;
    ref.read(authSessionProvider.notifier).signIn(_email.text.trim());
    if (context.mounted) context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AppTextField(
          label: 'Email',
          controller: _email,
          error: _emailError,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: Spacing.md),
        AppTextField(
          label: 'Password',
          controller: _password,
          error: _passwordError,
          obscureText: true,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: Spacing.lg),
        SizedBox(
          width: double.infinity,
          child: AppButton(label: 'Sign in', onPressed: _submit),
        ),
      ],
    );
  }
}
`,
  );

  // 7. providers — theme mode + auth session (the two every app needs)
  await write(
    "lib/providers/theme_mode.dart",
    `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ThemeModeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => ThemeMode.dark;

  void toggle() {
    state = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
  }

  void set(ThemeMode mode) {
    state = mode;
  }
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);
`,
  );

  await write(
    "lib/providers/auth_session.dart",
    `import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Demo session only — replace signIn with Supabase/Neon Auth and persist
/// the session (e.g. flutter_secure_storage) before shipping.
class AuthSessionNotifier extends Notifier<AsyncValue<String?>> {
  @override
  AsyncValue<String?> build() => const AsyncValue.data(null);

  void signIn(String email) {
    state = AsyncValue.data(email);
  }

  void signOut() {
    state = const AsyncValue.data(null);
  }
}

final authSessionProvider =
    NotifierProvider<AuthSessionNotifier, AsyncValue<String?>>(AuthSessionNotifier.new);
`,
  );

  // 8. services — dio client + config
  await write(
    "lib/services/api_client.dart",
    `import 'package:dio/dio.dart';
import 'app_config.dart';

/// Single Dio client for backend calls: base URL from --dart-define
/// API_BASE_URL (see README), auth header hook, typed error mapping.
class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int? statusCode;
  final String message;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

Dio createApiClient({String? authToken}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ),
  );
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        if (authToken != null && authToken.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $authToken';
        }
        return handler.next(options);
      },
      onError: (error, handler) {
        final status = error.response?.statusCode;
        final message = switch (error.response?.data) {
          {'message': final String m} => m,
          {'error': final String m} => m,
          _ => error.message ?? 'Request failed',
        };
        return handler.reject(
          DioException(requestOptions: error.requestOptions, error: ApiException(status, message)),
        );
      },
    ),
  );
  return dio;
}
`,
  );

  await write(
    "lib/services/app_config.dart",
    `/// Build-time config. Pass with --dart-define, e.g.:
/// flutter run --dart-define=API_BASE_URL=https://api.example.com
/// Defaults keep the preview working with no backend.
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: '');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');
}
`,
  );

  // 9. theme wiring off the token file
  await write(
    "lib/theme/app_theme.dart",
    `import 'package:flutter/material.dart';
import 'tokens.dart';

ThemeData buildCaideTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: ColorTokens.accent,
    brightness: brightness,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor:
        brightness == Brightness.dark ? ColorTokens.background : Colors.white,
    appBarTheme: AppBarTheme(
      backgroundColor:
          brightness == Brightness.dark ? ColorTokens.background : Colors.white,
      foregroundColor:
          brightness == Brightness.dark ? ColorTokens.textPrimary : Colors.black87,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor:
          brightness == Brightness.dark ? ColorTokens.surface : Colors.white,
      indicatorColor: ColorTokens.accent.withValues(alpha: 0.24),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
  );
}
`,
  );

  // 10. widget test
  await write(
    "test/app_button_test.dart",
    `import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:${pkgName}/widgets/app_button.dart';

void main() {
  testWidgets('AppButton calls onPressed with its label', (tester) async {
    var pressed = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppButton(label: 'Save', onPressed: () => pressed++),
        ),
      ),
    );
    expect(find.text('Save'), findsOneWidget);
    await tester.tap(find.text('Save'));
    expect(pressed, 1);
  });
}
`,
  );

  // 11. analysis options (lints on from day one)
  await write(
    "analysis_options.yaml",
    `include: package:flutter_lints/flutter.yaml

linter:
  rules:
    prefer_single_quotes: true
    require_trailing_commas: true
    prefer_const_constructors: true
`,
  );

  // 12. .env.example (dart-define reference) + README + AI_RULES
  await write(
    ".env.example",
    `# Flutter reads config via --dart-define (see lib/services/app_config.dart).
# Copy values into your run command; never commit real secrets.
# flutter run --dart-define=API_BASE_URL=https://api.example.com \\
#   --dart-define=SUPABASE_URL=https://xyz.supabase.co \\
#   --dart-define=SUPABASE_ANON_KEY=eyJ...
API_BASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
`,
  );

  await write(
    "README.md",
    `# ${appName}

Flutter + Riverpod + go_router + Dio, built with Caide.

## Run

- \`flutter pub get\`, then \`flutter run\` (device), \`flutter run -d web-server\` (browser preview in the device frame)
- Tests: \`flutter test\` (widget test included)
- Analyze: \`flutter analyze\` (very-good-analysis lints, must stay clean)
- Installable: \`flutter build apk --debug\`

## Map

- \`lib/main.dart\` — ProviderScope + ErrorWidget surface + theme/router wiring
- \`lib/router.dart\` — go_router bottom-tab shell (Home, Settings), \`/login\` modal, 404 screen
- \`lib/screens/\` — Home, Settings, Login screens
- \`lib/widgets/\` — AppButton, AppTextField, AppCard, SettingsRow, EmptyState, LoadingView, OfflineBanner, LoginForm
- \`lib/providers/\` — themeMode + authSession (the two every app needs)
- \`lib/services/\` — Dio client (interceptors, typed errors) + AppConfig (--dart-define)
- \`lib/theme/\` — ColorTokens/Spacing + Material3 theme
- \`assets/images/\`, \`assets/icons/\` — bundled assets (declared in pubspec.yaml)

## Rules

See \`AI_RULES.md\`. Config via \`--dart-define\` (see \`.env.example\`); never commit secrets.
`,
  );

  await write(
    "AI_RULES.md",
    `# AI Rules — ${appName} (flutter)

- Stack: Flutter 3 + Riverpod + go_router + Dio. Commands: \`flutter pub get\`, \`flutter run -d web-server\` (browser preview in the device frame), \`flutter test\`, \`flutter analyze\` (must stay clean), \`flutter build apk --debug\`.
- Paths: routes in \`lib/router.dart\` (screens in \`lib/screens/\`); shared widgets ONLY in \`lib/widgets/\`; providers in \`lib/providers/\`; backend calls through \`lib/services/api_client.dart\`; tokens in \`lib/theme/tokens.dart\`.
- Conventions: const constructors everywhere; relative imports inside \`lib/\` prohibited (use package: imports); Riverpod Notifier/NotifierProvider (no legacy StateNotifier); \`flutter analyze\` clean bar — fix lints before finishing.
- Navigation: go_router bottom-tab shell per the mobile contract; \`/login\` as a route (modal on mobile, page on web); NotFoundScreen for unknown routes.
- Widget kit law: reuse AppButton/AppTextField/AppCard/SettingsRow/EmptyState/LoadingView — never hand-roll parallel widgets, never hard-code colors (ColorTokens only).
- State: themeMode + authSession providers exist — extend the pattern (Notifier + provider per domain). Server state via the Dio client, not ad-hoc fetch calls.
- Auth: \`authSessionProvider\` is a demo session. Real auth = Supabase/Neon Auth wired into the notifier + LoginForm; persist with flutter_secure_storage before shipping.
- Forms: AppTextField + local validation state (see LoginForm); 44pt-equivalent touch targets (min 48px buttons).
- Resilience: OfflineBanner is mounted in main.dart — keep it. ErrorWidget surface stays; never remove it.
- Config: \`--dart-define\` via AppConfig (see \`.env.example\`). NEVER hard-code URLs or keys.
- Preview: web-server bundle renders in the device frame — verify there, then on device/emulator.
`,
  );

  // 13. .caide files
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

  // 14. .gitignore
  await write(
    ".gitignore",
    `.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.packages
build/
.env.local
ios/Flutter/.last_build_id
.caide/
`,
  );

  // 15. Web platform support (flutter run -d web-server / flutter build
  // web — the preview path). flutter create --platforms web equivalent:
  // index.html + manifest + placeholder icons (1px PNGs; replace with
  // real artwork before store submission).
  await write(
    "web/index.html",
    `<!DOCTYPE html>
<html>
<head>
  <base href="$FLUTTER_BASE_HREF">

  <meta charset="UTF-8">
  <meta content="IE=Edge" http-equiv="X-UA-Compatible">
  <meta name="description" content="${appName} built with Caide.">

  <!-- iOS meta tags & icons -->
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="${appName}">
  <link rel="apple-touch-icon" href="icons/Icon-192.png">

  <!-- Favicon -->
  <link rel="icon" type="image/png" href="favicon.png"/>

  <title>${appName}</title>
  <link rel="manifest" href="manifest.json">
</head>
<body>
  <script src="flutter_bootstrap.js" async></script>
</body>
</html>
`,
  );
  await write(
    "web/manifest.json",
    JSON.stringify(
      {
        name: appName,
        short_name: appName,
        start_url: ".",
        display: "standalone",
        background_color: "#0175C2",
        theme_color: "#0175C2",
        description: `${appName} built with Caide.`,
        orientation: "portrait-primary",
        prefer_related_applications: false,
        icons: [
          { src: "icons/Icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/Icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/Icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/Icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      null,
      4,
    ),
  );
  // Placeholder 1px transparent PNGs (replace with real icons).
  const placeholderIcon = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGJgAQAAAP//AwAABgAFV7+r1AAAAABJRU5ErkJggg==",
    "base64",
  );
  for (const iconPath of [
    "web/favicon.png",
    "web/icons/Icon-192.png",
    "web/icons/Icon-512.png",
    "web/icons/Icon-maskable-192.png",
    "web/icons/Icon-maskable-512.png",
  ]) {
    const full = path.join(root, iconPath);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, placeholderIcon);
    createdFiles.push(iconPath);
  }

  return createdFiles;
}
