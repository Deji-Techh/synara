import * as fs from "node:fs";
import * as path from "node:path";
import { colorTokens, typeScale, componentRules, radius } from "../../design/tokens.ts";

export async function scaffoldWebsite(root: string, appName = "MyWebsite"): Promise<string[]> {
  const createdFiles: string[] = [];
  const slug = appName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  const dirs = [
    root,
    path.join(root, "src"),
    path.join(root, "src", "components"),
    path.join(root, "src", "components", "ui"),
    path.join(root, "src", "components", "ui", "__tests__"),
    path.join(root, "src", "pages"),
    path.join(root, "src", "design"),
    path.join(root, "src", "lib"),
    path.join(root, "src", "store"),
    path.join(root, "public"),
    path.join(root, "e2e"),
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
    name: slug,
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc -b && vite build",
      preview: "vite preview",
      test: "vitest run",
      "test:e2e": "playwright test",
      lint: "tsc --noEmit",
    },
    dependencies: {
      "@tanstack/react-query": "^5.0.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      "react-router": "^7.0.0",
      zustand: "^5.0.0",
      zod: "^3.23.0",
      "lucide-react": "^0.460.0",
    },
    devDependencies: {
      "@playwright/test": "^1.49.0",
      "@testing-library/jest-dom": "^6.6.0",
      "@testing-library/react": "^16.0.0",
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.0",
      jsdom: "^25.0.0",
      tailwindcss: "^4.0.0",
      typescript: "^5.6.0",
      vite: "^6.0.0",
      vitest: "^3.0.0",
    },
  };

  await write("package.json", JSON.stringify(pkg, null, 2));

  // 2. vite.config.ts
  await write(
    "vite.config.ts",
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
  );

  // 2b. vitest.config.ts
  await write(
    "vitest.config.ts",
    `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
`,
  );

  // 2c. tsconfig.json
  await write(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          moduleDetection: "force",
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          types: ["vite/client"],
        },
        include: ["src", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"],
      },
      null,
      2,
    ),
  );

  // 3. index.html
  await write(
    "index.html",
    `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${appName} — built with Caide" />
    <meta name="theme-color" content="#0D0D0D" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>◍</text></svg>" />
    <title>${appName}</title>
  </head>
  <body class="bg-[#0D0D0D] text-white min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );

  // 3b. public/manifest.webmanifest
  await write(
    "public/manifest.webmanifest",
    JSON.stringify(
      {
        name: appName,
        short_name: appName,
        start_url: ".",
        display: "standalone",
        background_color: "#0D0D0D",
        theme_color: "#0D0D0D",
      },
      null,
      2,
    ),
  );

  // 4. src/main.tsx
  await write(
    "src/main.tsx",
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  );

  // 5. src/index.css
  await write(
    "src/index.css",
    `@import "tailwindcss";

:root {
  --background: #0D0D0D;
  --surface: #1A1A1A;
  --accent: #E8493C;
  --text: #FFFFFF;
  --muted: #9CA3AF;
}

:root.light {
  --background: #FFFFFF;
  --surface: #F3F4F6;
  --accent: #E8493C;
  --text: #111827;
  --muted: #6B7280;
}

body {
  background-color: var(--background);
  color: var(--text);
  font-family: system-ui, -apple-system, sans-serif;
}
`,
  );

  // 6. src/App.tsx — HashRouter (static-preview safe) + providers
  await write(
    "src/App.tsx",
    `import React from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import Layout from './components/Layout.tsx';
import Home from './pages/Home.tsx';
import Login from './pages/Login.tsx';
import NotFound from './pages/NotFound.tsx';
import { useThemeStore } from './store/theme.ts';

const queryClient = new QueryClient();

function ThemeClass() {
  const mode = useThemeStore((s) => s.mode);
  React.useEffect(() => {
    document.documentElement.classList.toggle('light', mode === 'light');
    document.documentElement.classList.toggle('dark', mode !== 'light');
  }, [mode]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeClass />
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home appName="${appName}" />} />
              <Route path="login" element={<Login />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
`,
  );

  // 6b. src/components/ErrorBoundary.tsx — never white-screen on a render fault
  await write(
    "src/components/ErrorBoundary.tsx",
    `import React from 'react';

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
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
          <p className="text-neutral-400 text-sm">Reload the preview to try again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
`,
  );

  // 6c. src/components/Layout.tsx — top navbar per the web contract
  await write(
    "src/components/Layout.tsx",
    `import React from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import ThemeToggle from './ThemeToggle.tsx';

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to || (to === '/' && location.pathname === '/');
  return (
    <Link
      to={to}
      className={\`px-3 py-1.5 rounded-md text-sm \${active ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}\`}
    >
      {children}
    </Link>
  );
}

export default function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-800">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1">
            <NavLink to="/">Home</NavLink>
            <NavLink to="/login">Login</NavLink>
          </div>
          <ThemeToggle />
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4">
        <Outlet />
      </main>
    </div>
  );
}
`,
  );

  // 6d. src/components/ThemeToggle.tsx
  await write(
    "src/components/ThemeToggle.tsx",
    `import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../store/theme.ts';
import { Button } from './ui/Button.tsx';

export default function ThemeToggle() {
  const { mode, toggle } = useThemeStore();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      {mode === 'light' ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}
`,
  );

  // 7. UI kit — theme tokens only, lucide icons
  const uiButton = `import React from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-white hover:opacity-90',
  secondary: 'bg-neutral-800 text-white hover:bg-neutral-700',
  outline: 'border border-neutral-700 text-white hover:bg-neutral-800',
  ghost: 'text-neutral-300 hover:bg-neutral-800 hover:text-white',
  danger: 'bg-red-600 text-white hover:bg-red-500',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-9 w-9',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={\`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none \${variants[variant]} \${sizes[size]} \${className}\`}
      {...rest}
    />
  );
}
`;
  await write("src/components/ui/Button.tsx", uiButton);

  await write(
    "src/components/ui/Input.tsx",
    `import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="mb-1 block text-xs font-medium text-neutral-300">{label}</span>}
      <input
        id={inputId}
        className={\`h-10 w-full rounded-md border bg-transparent px-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] \${error ? 'border-red-500' : 'border-neutral-700'} \${className}\`}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  );
}
`,
  );

  await write(
    "src/components/ui/Card.tsx",
    `import React from 'react';

export function Card({ className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={\`rounded-lg border border-neutral-800 bg-[var(--surface)] p-4 \${className}\`}
      {...rest}
    />
  );
}

export function CardTitle({ className = '', ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={\`text-base font-semibold text-white \${className}\`} {...rest} />;
}
`,
  );

  await write(
    "src/components/ui/Dialog.tsx",
    `import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button.tsx';

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-lg border border-neutral-800 bg-[var(--surface)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
`,
  );

  await write(
    "src/components/ui/Badge.tsx",
    `import React from 'react';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-800 text-neutral-200',
  accent: 'bg-[var(--accent)]/15 text-[var(--accent)]',
  success: 'bg-emerald-500/15 text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-300',
  danger: 'bg-red-500/15 text-red-300',
};

export function Badge({
  tone = 'neutral',
  className = '',
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={\`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium \${tones[tone]} \${className}\`}
      {...rest}
    />
  );
}
`,
  );

  await write(
    "src/components/ui/Tabs.tsx",
    `export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-neutral-800" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={\`px-3 py-2 text-sm \${value === t.id ? 'border-b-2 border-[var(--accent)] text-white' : 'text-neutral-400 hover:text-white'}\`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
`,
  );

  await write(
    "src/components/ui/Switch.tsx",
    `export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={\`relative h-6 w-11 rounded-full transition-colors \${checked ? 'bg-[var(--accent)]' : 'bg-neutral-700'}\`}
    >
      <span
        className={\`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all \${checked ? 'left-[22px]' : 'left-0.5'}\`}
      />
    </button>
  );
}
`,
  );

  await write(
    "src/components/ui/Avatar.tsx",
    `export function Avatar({ name, src }: { name: string; src?: string }) {
  const initials = name
    .split(/\\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (src) {
    return <img src={src} alt={name} className="h-9 w-9 rounded-full object-cover" />;
  }
  return (
    <div
      aria-label={name}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700 text-xs font-semibold text-white"
    >
      {initials || '?'}
    </div>
  );
}
`,
  );

  await write(
    "src/components/ui/Skeleton.tsx",
    `import React from 'react';

export function Skeleton({ className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={\`animate-pulse rounded-md bg-neutral-800 \${className}\`} {...rest} />;
}
`,
  );

  await write(
    "src/components/ui/EmptyState.tsx",
    `import React from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 px-4 py-10 text-center">
      <Inbox size={20} className="text-neutral-500" />
      <p className="text-sm font-medium text-white">{title}</p>
      {hint && <p className="max-w-sm text-xs text-neutral-400">{hint}</p>}
      {action}
    </div>
  );
}
`,
  );

  await write(
    "src/components/ui/__tests__/button.test.tsx",
    `import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Button } from '../Button.tsx';

afterEach(cleanup);

describe('Button', () => {
  it('renders children and handles clicks', async () => {
    let clicked = 0;
    render(<Button onClick={() => { clicked += 1; }}>Save</Button>);
    const el = screen.getByRole('button', { name: 'Save' });
    expect(el).toBeDefined();
    el.click();
    expect(clicked).toBe(1);
  });

  it('disables interaction when disabled', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });
});
`,
  );

  // 8. pages
  await write(
    "src/pages/Home.tsx",
    `import { Link } from 'react-router';
import { Card, CardTitle } from '../components/ui/Card.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Button } from '../components/ui/Button.tsx';

export default function Home({ appName }: { appName: string }) {
  return (
    <div className="flex flex-col gap-4 py-8">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Welcome to {appName}</h1>
        <Badge tone="accent">new</Badge>
      </div>
      <p className="text-sm text-neutral-400">
        Scaffolded with Vite + React + Tailwind v4. Edit <code>src/pages/Home.tsx</code> to begin.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Design system</CardTitle>
          <p className="mt-1 text-sm text-neutral-400">
            Buttons, inputs, dialogs, and more live in <code>src/components/ui/</code> — theme tokens only, no hard-coded colors.
          </p>
        </Card>
        <Card>
          <CardTitle>Auth-ready</CardTitle>
          <p className="mt-1 text-sm text-neutral-400">
            The login page wires a validated form to the auth store. Plug in Supabase or Neon Auth when ready.
          </p>
          <div className="mt-3">
            <Link to="/login">
              <Button variant="outline" size="sm">Open login</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
`,
  );

  await write(
    "src/pages/Login.tsx",
    `import LoginForm from '../components/LoginForm.tsx';
import { Card, CardTitle } from '../components/ui/Card.tsx';

export default function Login() {
  return (
    <div className="mx-auto max-w-md py-10">
      <Card>
        <CardTitle>Sign in</CardTitle>
        <p className="mb-4 mt-1 text-sm text-neutral-400">
          Local demo auth — replace <code>useAuthStore.login</code> with Supabase or Neon Auth.
        </p>
        <LoginForm />
      </Card>
    </div>
  );
}
`,
  );

  await write(
    "src/pages/NotFound.tsx",
    `import { Link } from 'react-router';
import { Button } from '../components/ui/Button.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';

export default function NotFound() {
  return (
    <div className="py-10">
      <EmptyState
        title="Page not found"
        hint="The route you opened does not exist."
        action={
          <Link to="/">
            <Button variant="outline" size="sm">Go home</Button>
          </Link>
        }
      />
    </div>
  );
}
`,
  );

  // 9. LoginForm — controlled + zod, no extra form dep
  await write(
    "src/components/LoginForm.tsx",
    `import React, { useState } from 'react';
import { z } from 'zod';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { useAuthStore } from '../store/auth.ts';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password needs at least 8 characters'),
});

export default function LoginForm() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [done, setDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({ email: flat.email?.[0], password: flat.password?.[0] });
      return;
    }
    setErrors({});
    login(parsed.data.email);
    setDone(true);
  };

  if (done) {
    return <p className="text-sm text-emerald-300">Signed in locally. Wire a real provider to go further.</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      <Button type="submit">Sign in</Button>
    </form>
  );
}
`,
  );

  // 10. stores — zustand (+persist for theme)
  await write(
    "src/store/theme.ts",
    `import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      toggle: () => set((s) => ({ mode: s.mode === 'dark' ? 'light' : 'dark' })),
      setMode: (mode) => set({ mode }),
    }),
    { name: 'theme' },
  ),
);
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

  // 11. lib/api.ts — single fetch wrapper for backend calls
  await write(
    "src/lib/api.ts",
    `export interface ApiError extends Error {
  status: number;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  const res = await fetch(\`\${base}\${path}\`, {
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

  // 12. playwright.config.ts — e2e boots its own preview server
  await write(
    "playwright.config.ts",
    `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: { baseURL: 'http://localhost:5199' },
  webServer: {
    command: 'bunx vite preview --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
`,
  );

  // 12b. e2e smoke spec
  await write(
    "e2e/smoke.spec.ts",
    `import { expect, test } from '@playwright/test';

test('home renders and login navigates', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome to/ })).toBeVisible();
  await page.getByRole('link', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
`,
  );

  // 13. .env.example
  await write(
    ".env.example",
    `# Copy to .env.local for local secrets (never commit .env.local).
# Public client config uses the VITE_ prefix (it ships in the bundle):
# VITE_API_BASE_URL=http://localhost:3000
# VITE_SUPABASE_URL=
# VITE_SUPABASE_ANON_KEY=
`,
  );

  // 14. README.md
  await write(
    "README.md",
    `# ${appName}

Vite + React 19 + Tailwind v4 scaffold built with Caide.

## Run

- \`bun install\` then \`bun run dev\` (preview), \`bun run build\` (typecheck + build)
- Tests: \`bun run test\` (unit), \`bun run test:e2e\` (Playwright, needs \`bunx playwright install\`)
- Lint/typecheck: \`bun run lint\`

## Map

- \`src/pages/\` — routes (Home, Login, NotFound), wired in \`src/App.tsx\` (HashRouter: static-preview safe)
- \`src/components/ui/\` — Button, Input, Card, Dialog, Badge, Tabs, Switch, Avatar, Skeleton, EmptyState
- \`src/components/\` — Layout (navbar), ThemeToggle, LoginForm, ErrorBoundary
- \`src/store/\` — zustand slices (theme persisted, auth demo session)
- \`src/lib/api.ts\` — fetch wrapper for backend calls
- \`src/design/\` + \`.caide/design-spec.json\` — theme tokens (single source of truth)

## Rules

See \`AI_RULES.md\`. Client-only app: no server secrets in \`src/\`.
`,
  );

  // 15. AI_RULES.md — stack conventions the agent must follow
  await write(
    "AI_RULES.md",
    `# AI Rules — ${appName} (website)

- Stack: Vite + React 19 + Tailwind CSS v4 + React Router (HashRouter) + zustand + React Query + zod.
- Commands: \`bun run dev\` (preview), \`bun run build\` (tsc + build), \`bun run test\` (vitest), \`bun run test:e2e\` (playwright), \`bun run lint\` (tsc --noEmit).
- Paths: routes in \`src/pages/\` (add a Route in \`src/App.tsx\`); shared UI ONLY in \`src/components/ui/\`; features in \`src/components/\`; slices in \`src/store/\`; backend calls through \`src/lib/api.ts\`; tokens in \`src/design/\` + \`.caide/design-spec.json\`.
- UI kit law: reuse Button/Input/Card/Dialog/Badge/Tabs/Switch/Avatar/Skeleton/EmptyState — never hand-roll parallel components, never hard-code colors (theme vars only).
- Client-only app: NEVER reference server secrets or \`process.env.DATABASE_URL\` from \`src/\` — the Vite bundle is public. Server config uses \`VITE_\`-prefixed vars documented in \`.env.example\`.
- Styling: Tailwind utilities first; CSS variables in \`src/index.css\` for theme tokens; light mode via \`.light\` class (see ThemeToggle + theme store).
- Auth: \`useAuthStore\` is a demo session. Real auth = Supabase/Neon Auth wired into the store + LoginForm; keep the Login page shape.
- Every route renders inside \`Layout\` inside \`ErrorBoundary\`; keep both mounted. Add e2e coverage in \`e2e/\` for new user flows.
`,
  );

  // 16. .caide files
  await write(
    ".caide/framework.json",
    JSON.stringify({ framework: "website", appName, createdAt: Date.now() }, null, 2),
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

  // 17. .gitignore
  await write(
    ".gitignore",
    `node_modules/
dist/
dist-ssr
*.local
test-results/
playwright-report/
.caide/
`,
  );

  return createdFiles;
}
