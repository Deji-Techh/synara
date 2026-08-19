# Tech Stack

- You are building a React application.
- Use TypeScript.
- Use React Router. KEEP the routes in src/App.tsx
- Always put source code in the src folder.
- Put pages into src/pages/
- Put components into src/components/
- The main page (default page) is src/pages/Index.tsx
- UPDATE the main page to include the new components. OTHERWISE, the user can NOT see any components!
- ALWAYS try to use the shadcn/ui library.
- Tailwind CSS: always use Tailwind CSS for styling components. Utilize Tailwind classes extensively for layout, spacing, colors, and other design aspects.

# CAIDE Mobile UI Contract

- CAIDE already renders this application inside the selected iPhone, Samsung, tablet, or responsive preview frame.
- Render app content only. Never create a fake phone, status bar, notch, camera cutout, home indicator, browser toolbar, or device border.
- The root screen must fill the real preview viewport with `min-height: 100dvh`, `width: 100%`, and no horizontal page scrolling.
- Never lock the app to a simulated phone canvas such as `390x780`, fixed 320-430px widths, or fixed 600-1000px heights.
- Reflow for compact phones, large phones, tablets, portrait, and landscape. Use stable grid/flex constraints and one intentional vertical scroll container.
- Establish semantic color, typography, spacing, radius, elevation, and motion tokens. Avoid nested cards, decorative gradients, and generic demo content.
- Keep tap targets at least 44 by 44 logical pixels and provide accessible names, focus states, and keyboard behavior.
- Every visible action must work, navigate, persist state, call a backend adapter, or show a precise setup-required state.
- Verify the actual application screen in the CAIDE preview after editing; do not create a separate mock renderer.

Available packages and libraries:

- The lucide-react package is installed for icons.
- You ALREADY have ALL the shadcn/ui components and their dependencies installed. So you don't need to install them again.
- You have ALL the necessary Radix UI components installed.
- Use prebuilt components from the shadcn/ui library after importing them. Note that these files shouldn't be edited, so make new components if you need to change them.

# CAIDE UI Component Library (`@/caide-ui`)

This project includes a custom CAIDE UI layer on top of shadcn/ui. Use these components for the main screen structure. Import them from `@/caide-ui`.

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `<CaideScreen>` | Full-viewport root container (replaces a plain `<div className="min-h-dvh w-full">`) | `className` |
| `<CaideAnimatedScreen>` | Like CaideScreen but with a view-transition animation | `transitionId` (string), `className` |
| `<CaideSection>` | Content section with horizontal padding and max-width centering | `className` |
| `<CaideStack>` | Vertical flex stack with a configurable gap | `gap` (number, default 4), `className` |
| `<CaideSurface>` | Card-like surface with elevation levels | `level` ("flat" \| "raised" \| "overlay"), `className` |
| `<CaideStaggerGroup>` | Wrapper that staggers child entrance animations | `className` |
| `<CaideStaggerItem>` | Individual animated child inside CaideStaggerGroup | `index` (number — controls delay), `className` |

**Usage example:**
```tsx
import { CaideScreen, CaideSection, CaideStack, CaideSurface, CaideStaggerGroup, CaideStaggerItem } from "@/caide-ui";

const MyPage = () => (
  <CaideScreen>
    <CaideSection>
      <CaideSurface level="raised">
        <CaideStaggerGroup>
          <CaideStack gap={3}>
            <CaideStaggerItem index={0}>
              <h1 className="text-2xl font-bold">Hello</h1>
            </CaideStaggerItem>
            <CaideStaggerItem index={1}>
              <p>Content goes here</p>
            </CaideStaggerItem>
          </CaideStack>
        </CaideStaggerGroup>
      </CaideSurface>
    </CaideSection>
  </CaideScreen>
);
```

**CSS tokens (use these instead of raw hex colors):**
- `var(--caide-accent)` — primary accent colour
- `var(--caide-text-secondary)` — muted/secondary text
- `var(--caide-surface-raised)` — raised card background
- `var(--caide-border)` — border colour

# Toast Notifications

Use **Sonner** (already installed, already mounted in App.tsx):
```tsx
import { toast } from "sonner";

toast.success("Saved!");
toast.error("Something went wrong");
toast.loading("Uploading...");
```

Do NOT install `react-hot-toast`, `react-toastify`, or any other toast library.

# Backend Integration (when `api/` directory exists)

If this app has a backend (`api/` directory at the project root), use the typed API client:

```tsx
import { api, ApiRequestError } from "@/lib/api";

// GET
const items = await api.get<Item[]>("/items", { token: sessionToken });

// POST
const item = await api.post<Item>("/items", { title: "Hello" }, { token: sessionToken });

// Error handling
try {
  const result = await api.post<Item>("/items", data, { token });
} catch (err) {
  if (err instanceof ApiRequestError) {
    toast.error(err.message); // err.code, err.status also available
  }
}
```

The API base URL is read from `VITE_API_URL` in `.env` (defaults to `http://localhost:3001`).

The response envelope from the backend is `{ data: T, error: null, requestId: string }` on success,
and `{ data: null, error: { code, message }, requestId }` on failure — the API client handles this
automatically and throws an `ApiRequestError` on failure.

# No Mock Data

Never generate fake, mock, or placeholder data (sample posts, messages, users, transactions, etc.). Always render authentic empty states like "No posts yet", "No messages", "Get started by creating your first item". Only include sample/seed data if the user explicitly asks for it.
