import * as fs from "node:fs";
import * as path from "node:path";
import { colorTokens, typeScale, componentRules, radius } from "../../design/tokens.ts";

export async function scaffoldReactNative(
  root: string,
  appName = "MyReactNativeApp",
): Promise<string[]> {
  const createdFiles: string[] = [];
  const slug = appName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const scheme = slug || "caideapp";

  const dirs = [
    root,
    path.join(root, "app"),
    path.join(root, "app", "(tabs)"),
    path.join(root, "src"),
    path.join(root, "src", "components"),
    path.join(root, "src", "components", "__tests__"),
    path.join(root, "src", "screens"),
    path.join(root, "src", "design"),
    path.join(root, "src", "lib"),
    path.join(root, "src", "store"),
    path.join(root, "src", "store", "__tests__"),
    path.join(root, "assets"),
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

  // 1. package.json
  const pkg = {
    name: appName.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
    version: "1.0.0",
    main: "expo-router/entry",
    scripts: {
      start: "expo start",
      android: "expo start --android",
      ios: "expo start --ios",
      web: "expo start --web",
      test: "jest",
      lint: "tsc --noEmit",
    },
    dependencies: {
      expo: "~52.0.0",
      "expo-constants": "~17.0.0",
      "expo-linking": "~7.0.0",
      "expo-router": "~4.0.0",
      "expo-status-bar": "~2.0.0",
      "@expo/vector-icons": "^14.0.0",
      react: "18.3.1",
      "react-native": "0.76.0",
      "react-native-safe-area-context": "^4.12.0",
      "react-native-screens": "^4.4.0",
      // Web rendering support so `expo start --web` serves a browser preview
      // (rendered inside the device frame).
      "react-native-web": "^0.19.0",
      "react-dom": "18.3.1",
      "@expo/metro-runtime": "~4.0.0",
      zustand: "^5.0.0",
      "@tanstack/react-query": "^5.0.0",
      zod: "^3.23.0",
    },
    devDependencies: {
      "@babel/core": "^7.20.0",
      "@types/jest": "^29.5.0",
      "@types/react": "~18.3.12",
      "babel-preset-expo": "~12.0.0",
      jest: "^29.7.0",
      typescript: "^5.3.3",
    },
  };

  await write("package.json", JSON.stringify(pkg, null, 2));

  // 2. app.json
  await write(
    "app.json",
    JSON.stringify(
      {
        expo: {
          name: appName,
          slug,
          scheme,
          version: "1.0.0",
          orientation: "portrait",
          userInterfaceStyle: "automatic",
          splash: { backgroundColor: "#0D0D0D", resizeMode: "contain" },
          assetBundlePatterns: ["assets/*"],
          ios: { supportsTablet: true, bundleIdentifier: `com.caide.${slug}` },
          android: { package: `com.caide.${slug}`, adaptiveIcon: { backgroundColor: "#0D0D0D" } },
          web: { bundler: "metro", output: "static" },
          plugins: ["expo-router"],
        },
      },
      null,
      2,
    ),
  );

  // 2b. eas.json — installable builds (debug/dev-client first, store later)
  await write(
    "eas.json",
    JSON.stringify(
      {
        cli: { version: ">= 12.0.0" },
        build: {
          development: { developmentClient: true, distribution: "internal" },
          preview: { distribution: "internal", android: { buildType: "apk" } },
          production: { autoIncrement: true },
        },
        submit: { production: {} },
      },
      null,
      2,
    ),
  );

  // 3. babel + ts + jest config
  await write(
    "babel.config.js",
    `module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
`,
  );

  await write(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-native",
          strict: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
        },
        include: ["App.tsx", "app", "src"],
        exclude: ["node_modules"],
      },
      null,
      2,
    ),
  );

  await write(
    "jest.config.js",
    `module.exports = {
  preset: 'react-native',
  setupFilesAfterEach: [],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transformIgnorePatterns: [],
};
`,
  );

  // 4. src/design/tokens.ts
  await write(
    "src/design/tokens.ts",
    `export const colorTokens = ${JSON.stringify(colorTokens, null, 2)} as const;\n` +
      `export const typeScale = ${JSON.stringify(typeScale, null, 2)} as const;\n` +
      `export const componentRules = ${JSON.stringify(componentRules, null, 2)} as const;\n` +
      `export const radius = ${JSON.stringify(radius, null, 2)} as const;\n` +
      `export const spacingUnit = 4 as const;\n`,
  );

  // 5. expo-router entry + tab shell (mobile contract: bottom tabs)
  await write(
    "app/_layout.tsx",
    `import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useThemeStore } from '../src/store/theme';
import ErrorBoundary from '../src/components/ErrorBoundary';

const queryClient = new QueryClient();

export default function RootLayout() {
  const mode = useThemeStore((s) => s.mode);
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
`,
  );

  await write(
    "app/(tabs)/_layout.tsx",
    `import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colorTokens } from '../../src/design/tokens';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colorTokens.accent,
        tabBarStyle: { backgroundColor: colorTokens.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
`,
  );

  await write(
    "app/(tabs)/index.tsx",
    `import React from 'react';
import HomeScreen from '../../src/screens/HomeScreen';

export default function HomeRoute() {
  return <HomeScreen appName="${appName}" />;
}
`,
  );

  await write(
    "app/(tabs)/settings.tsx",
    `import React from 'react';
import SettingsScreen from '../../src/screens/SettingsScreen';

export default function SettingsRoute() {
  return <SettingsScreen />;
}
`,
  );

  await write(
    "app/login.tsx",
    `import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoginForm from '../src/components/LoginForm';
import { colorTokens, spacingUnit } from '../src/design/tokens';

export default function LoginRoute() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}>
      <LoginForm />
    </SafeAreaView>
  );
}
`,
  );

  await write(
    "app/+not-found.tsx",
    `import React from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { colorTokens } from '../src/design/tokens';

export default function NotFound() {
  return (
    <View style={{ flex: 1, backgroundColor: colorTokens.background, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colorTokens.textPrimary, fontSize: 18 }}>Screen not found</Text>
      <Link href="/(tabs)" style={{ color: colorTokens.accent, marginTop: 12 }}>
        Go home
      </Link>
    </View>
  );
}
`,
  );

  // 6. screens
  await write(
    "src/screens/HomeScreen.tsx",
    `import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '../components/Card';
import { AppButton } from '../components/AppButton';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { useAuthStore } from '../store/auth';
import { colorTokens, spacingUnit } from '../design/tokens';

export default function HomeScreen({ appName }: { appName: string }) {
  const router = useRouter();
  const userEmail = useAuthStore((s) => s.userEmail);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colorTokens.background }}
      contentContainerStyle={{ padding: spacingUnit * 4, gap: spacingUnit * 3 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacingUnit * 2 }}>
        <Text style={{ color: colorTokens.textPrimary, fontSize: 24, fontWeight: 'bold' }}>
          Welcome to {appName}
        </Text>
        <Badge tone="accent">new</Badge>
      </View>
      <Card>
        <Text style={{ color: colorTokens.textPrimary, fontSize: 16, fontWeight: '600' }}>Design system</Text>
        <Text style={{ color: colorTokens.textMuted, fontSize: 14, marginTop: 4 }}>
          Buttons, inputs, cards, and rows live in src/components/ — theme tokens only.
        </Text>
      </Card>
      {userEmail ? (
        <Card>
          <Text style={{ color: colorTokens.textPrimary }}>Signed in as {userEmail}</Text>
        </Card>
      ) : (
        <EmptyState
          title="Not signed in"
          hint="Sign in to sync your data across devices."
          actionLabel="Sign in"
          onAction={() => router.push('/login')}
        />
      )}
      <AppButton title="Open settings" variant="outline" onPress={() => router.push('/(tabs)/settings')} />
    </ScrollView>
  );
}
`,
  );

  await write(
    "src/screens/SettingsScreen.tsx",
    `import React from 'react';
import { ScrollView, Text } from 'react-native';
import { ListRow } from '../components/ListRow';
import { useThemeStore } from '../store/theme';
import { useAuthStore } from '../store/auth';
import { colorTokens, spacingUnit } from '../design/tokens';

export default function SettingsScreen() {
  const { mode, toggle } = useThemeStore();
  const { userEmail, logout } = useAuthStore();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colorTokens.background }} contentContainerStyle={{ padding: spacingUnit * 4 }}>
      <Text style={{ color: colorTokens.textPrimary, fontSize: 20, fontWeight: 'bold', marginBottom: spacingUnit * 2 }}>
        Settings
      </Text>
      <ListRow
        icon="moon-outline"
        title="Appearance"
        detail={mode === 'light' ? 'Light' : 'Dark'}
        onPress={toggle}
      />
      {userEmail && (
        <ListRow icon="log-out-outline" title={'Sign out (' + (userEmail ?? '') + ')'} onPress={logout} />
      )}
    </ScrollView>
  );
}
`,
  );

  // 7. component kit — theme tokens only
  await write(
    "src/components/AppButton.tsx",
    `import React from 'react';
import { Pressable, Text } from 'react-native';
import { colorTokens, radius, spacingUnit } from '../design/tokens';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

const backgrounds: Record<Variant, string> = {
  primary: colorTokens.accent,
  outline: 'transparent',
  ghost: 'transparent',
  danger: '#DC2626',
};

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
}) {
  const bordered = variant === 'outline';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: backgrounds[variant],
        borderRadius: radius.pill,
        paddingVertical: spacingUnit * 3,
        paddingHorizontal: spacingUnit * 4,
        alignItems: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        borderWidth: bordered ? 1 : 0,
        borderColor: bordered ? colorTokens.border : 'transparent',
      })}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}
`,
  );

  await write(
    "src/components/AppTextInput.tsx",
    `import React from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';
import { colorTokens, radius, spacingUnit } from '../design/tokens';

export function AppTextInput({
  label,
  error,
  ...rest
}: TextInputProps & { label?: string; error?: string }) {
  return (
    <View>
      {label ? (
        <Text style={{ color: colorTokens.textMuted, fontSize: 12, fontWeight: '600', marginBottom: spacingUnit }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colorTokens.textMuted}
        style={{
          borderWidth: 1,
          borderColor: error ? '#EF4444' : colorTokens.border,
          borderRadius: radius.pill,
          paddingVertical: spacingUnit * 3,
          paddingHorizontal: spacingUnit * 3,
          color: colorTokens.textPrimary,
          fontSize: 15,
        }}
        {...rest}
      />
      {error ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: spacingUnit }}>{error}</Text> : null}
    </View>
  );
}
`,
  );

  await write(
    "src/components/Card.tsx",
    `import React from 'react';
import { View, type ViewProps } from 'react-native';
import { colorTokens, radius, spacingUnit } from '../design/tokens';

export function Card({ style, ...rest }: ViewProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colorTokens.surface,
          borderRadius: radius.card,
          padding: spacingUnit * 4,
          borderWidth: 1,
          borderColor: colorTokens.border,
        },
        style,
      ]}
      {...rest}
    />
  );
}
`,
  );

  await write(
    "src/components/ListRow.tsx",
    `import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colorTokens, spacingUnit } from '../design/tokens';

export function ListRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingUnit * 3,
        paddingVertical: spacingUnit * 3,
        borderBottomWidth: 1,
        borderBottomColor: colorTokens.border,
      }}
    >
      <Ionicons name={icon} size={20} color={colorTokens.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colorTokens.textPrimary, fontSize: 15 }}>{title}</Text>
        {detail ? <Text style={{ color: colorTokens.textMuted, fontSize: 13 }}>{detail}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colorTokens.textMuted} />
    </Pressable>
  );
}
`,
  );

  await write(
    "src/components/Badge.tsx",
    `import React from 'react';
import { Text, View } from 'react-native';
import { colorTokens, radius } from '../design/tokens';

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent'; children: React.ReactNode }) {
  const accent = tone === 'accent';
  return (
    <View
      style={{
        backgroundColor: accent ? colorTokens.accent : colorTokens.surface,
        borderRadius: radius.pill,
        paddingVertical: 2,
        paddingHorizontal: 8,
        borderWidth: accent ? 0 : 1,
        borderColor: colorTokens.border,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}
`,
  );

  await write(
    "src/components/EmptyState.tsx",
    `import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton';
import { colorTokens, radius, spacingUnit } from '../design/tokens';

export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        gap: spacingUnit * 2,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colorTokens.border,
        borderRadius: radius.card,
        padding: spacingUnit * 6,
      }}
    >
      <Ionicons name="file-tray-outline" size={24} color={colorTokens.textMuted} />
      <Text style={{ color: colorTokens.textPrimary, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      {hint ? <Text style={{ color: colorTokens.textMuted, fontSize: 13, textAlign: 'center' }}>{hint}</Text> : null}
      {actionLabel && onAction ? <AppButton title={actionLabel} variant="outline" onPress={onAction} /> : null}
    </View>
  );
}
`,
  );

  await write(
    "src/components/ErrorBoundary.tsx",
    `import React from 'react';
import { Text, View } from 'react-native';
import { colorTokens } from '../design/tokens';

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('[app] render fault', error);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: colorTokens.background, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Text style={{ color: colorTokens.textPrimary, fontSize: 18 }}>Something went wrong</Text>
          <Text style={{ color: colorTokens.textMuted, fontSize: 14, marginTop: 8 }}>Reload the preview to try again.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
`,
  );

  // 8. LoginForm — controlled + zod
  await write(
    "src/components/LoginForm.tsx",
    `import React, { useState } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { router } from 'expo-router';
import { AppTextInput } from './AppTextInput';
import { AppButton } from './AppButton';
import { Card } from './Card';
import { useAuthStore } from '../store/auth';
import { spacingUnit } from '../design/tokens';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password needs at least 8 characters'),
});

export default function LoginForm() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const submit = () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({ email: flat.email?.[0], password: flat.password?.[0] });
      return;
    }
    setErrors({});
    login(parsed.data.email);
    router.replace('/(tabs)');
  };

  return (
    <Card>
      <View style={{ gap: spacingUnit * 3 }}>
        <AppTextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <AppTextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
          autoComplete="password"
        />
        <AppButton title="Sign in" onPress={submit} />
      </View>
    </Card>
  );
}
`,
  );

  // 9. stores — zustand (plain, no native deps so jest runs anywhere)
  await write(
    "src/store/theme.ts",
    `import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  mode: 'dark',
  toggle: () => set((s) => ({ mode: s.mode === 'dark' ? 'light' : 'dark' })),
  setMode: (mode) => set({ mode }),
}));
`,
  );

  await write(
    "src/store/auth.ts",
    `import { create } from 'zustand';

interface AuthState {
  /** Demo session only — replace with Supabase/Neon Auth session handling. */
  userEmail: string | null;
  login: (email: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  userEmail: null,
  login: (email) => set({ userEmail: email }),
  logout: () => set({ userEmail: null }),
}));
`,
  );

  await write(
    "src/store/__tests__/theme.test.ts",
    `import { useThemeStore } from '../theme';

describe('theme store', () => {
  it('toggles between dark and light', () => {
    useThemeStore.setState({ mode: 'dark' });
    expect(useThemeStore.getState().mode).toBe('dark');
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().mode).toBe('light');
    useThemeStore.getState().setMode('dark');
    expect(useThemeStore.getState().mode).toBe('dark');
  });
});
`,
  );

  // 10. lib/api.ts — single fetch wrapper for backend calls
  await write(
    "src/lib/api.ts",
    `export interface ApiError extends Error {
  status: number;
}

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(\`\${baseUrl}\${path}\`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const err = new Error(\`API \${res.status}: \${res.statusText}\`) as ApiError;
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}
`,
  );

  // 11. .env.example
  await write(
    ".env.example",
    `# Copy to .env.local for local secrets (never commit .env.local).
# Public client config uses the EXPO_PUBLIC_ prefix (it ships in the bundle):
# EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
# EXPO_PUBLIC_SUPABASE_URL=
# EXPO_PUBLIC_SUPABASE_ANON_KEY=
`,
  );

  // 12. README.md
  await write(
    "README.md",
    `# ${appName}

Expo (SDK 52) + expo-router + NativeWind-ready tokens, built with Caide.

## Run

- \`bun install\` then \`bun run start\` (scan QR), \`bun run android\` / \`bun run ios\`, \`bun run web\` (browser preview in the device frame)
- Tests: \`bun run test\` (jest, stores + logic — no native runtime needed)
- Typecheck: \`bun run lint\` (tsc --noEmit)
- Installable builds: \`eas build\` (see eas.json; debug APK via the preview profile)

## Map

- \`app/\` — expo-router routes: \`(tabs)/\` bottom-tab shell (Home, Settings), \`login.tsx\` modal, \`+not-found.tsx\`
- \`src/screens/\` — screen components (route files stay thin)
- \`src/components/\` — AppButton, AppTextInput, Card, ListRow, Badge, EmptyState, LoginForm, ErrorBoundary
- \`src/store/\` — zustand slices (theme, auth demo session)
- \`src/lib/api.ts\` — fetch wrapper for backend calls
- \`src/design/tokens.ts\` + \`.caide/design-spec.json\` — theme tokens (single source of truth)

## Rules

See \`AI_RULES.md\`. Safe areas + keyboard avoidance on every form screen. Client-only app: no server secrets in \`src/\` or \`app/\`.
`,
  );

  // 13. AI_RULES.md
  await write(
    "AI_RULES.md",
    `# AI Rules — ${appName} (react-native)

- Stack: Expo SDK 52 + expo-router (file routes) + React 19 + zustand + React Query + zod.
- Commands: \`bun run start|android|ios|web\` (web = browser preview in the device frame), \`bun run test\` (jest), \`bun run lint\` (tsc --noEmit). Installable: \`eas build\` per eas.json.
- Paths: routes in \`app/\` (thin — delegate to \`src/screens/\`); shared UI ONLY in \`src/components/\`; slices in \`src/store/\`; backend calls through \`src/lib/api.ts\`; tokens in \`src/design/tokens.ts\` + \`.caide/design-spec.json\`.
- Navigation: expo-router file routes; bottom tabs in \`app/(tabs)/_layout.tsx\` per the mobile contract (Home, Settings + feature tabs). Modals via \`presentation: 'modal'\`.
- UI kit law: reuse AppButton/AppTextInput/Card/ListRow/Badge/EmptyState — never hand-roll parallel components, never hard-code colors (token file only).
- Mobile rules: SafeAreaView/SafeAreaProvider on every screen; KeyboardAvoidingView (iOS padding) on every form; 44pt minimum touch targets; offline-tolerant (EmptyState, not blank screens).
- Auth: \`useAuthStore\` is a demo session. Real auth = Supabase/Neon Auth wired into the store + LoginForm; keep the login modal shape.
- Public config uses \`EXPO_PUBLIC_\` vars documented in \`.env.example\`. NEVER put secrets in client code.
- Preview: \`expo start --web\` renders via react-native-web in the device frame — verify there, then on device.
`,
  );

  // 14. .caide files
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

  // 15. .gitignore
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
.env.local
.caide/
`,
  );

  return createdFiles;
}
