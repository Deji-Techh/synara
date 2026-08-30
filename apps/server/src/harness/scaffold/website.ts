import * as fs from "node:fs";
import * as path from "node:path";
import { colorTokens, typeScale, componentRules, radius } from "../../design/tokens.ts";

export async function scaffoldWebsite(root: string, appName = "MyWebsite"): Promise<string[]> {
  const createdFiles: string[] = [];

  const dirs = [
    root,
    path.join(root, "src"),
    path.join(root, "src", "components"),
    path.join(root, "src", "pages"),
    path.join(root, "src", "design"),
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
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc -b && vite build",
      preview: "vite preview",
    },
    dependencies: {
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      zustand: "^5.0.0",
      "lucide-react": "^0.460.0",
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.0",
      tailwindcss: "^4.0.0",
      typescript: "^5.6.0",
      vite: "^6.0.0",
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

  // 3. index.html
  await write(
    "index.html",
    `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName}</title>
  </head>
  <body class="bg-[#0D0D0D] text-white min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
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
  --accent: #E8493C;
}

body {
  background-color: var(--background);
  color: #FFFFFF;
  font-family: system-ui, -apple-system, sans-serif;
}
`,
  );

  // 6. src/App.tsx
  await write(
    "src/App.tsx",
    `import React from 'react';

export default function App() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
        Welcome to ${appName}
      </h1>
      <p className="text-neutral-400 text-sm">
        Scaffolded with Vite + React + Tailwind v4
      </p>
    </div>
  );
}
`,
  );

  // 7. .caide files
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
  await write(".caide/spec.md", `# Specification: ${appName}\n\n*Pending specification planning.*\n`);

  // 8. .gitignore
  await write(
    ".gitignore",
    `node_modules/
dist/
dist-ssr
*.local
`,
  );

  return createdFiles;
}
