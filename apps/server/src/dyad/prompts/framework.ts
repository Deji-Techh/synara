// FILE: framework.ts
// Purpose: Caide product-framework layer for the transplanted Dyad prompts.
// Donor system prompts are kept EXACT (React/Vite-flavored); this module adds
// a `<caide_framework>` notice prepended by the constructors so agent, plan,
// ask, and build modes always know which immutable framework the project uses
// (blank | react-native | flutter | website) — its stack, layout, commands,
// preview, and constraints. Mirrors the M15 scaffold + framework registry.

export const CAIDE_FRAMEWORKS = [
  "blank",
  "react-native",
  "flutter",
  "website",
] as const;
export type CaideFramework = (typeof CAIDE_FRAMEWORKS)[number];

export function normalizeCaideFramework(value: unknown): CaideFramework | undefined {
  return (CAIDE_FRAMEWORKS as readonly string[]).includes(value as string)
    ? (value as CaideFramework)
    : undefined;
}

const BLANK_BRIEF = `
The project framework is BLANK: an empty workspace with no stack assumptions.
- Do NOT assume React, npm, or any UI framework. Inspect the workspace first.
- There is no preview and no build pipeline for Blank projects — say so explicitly instead of failing silently.
- Ask the user which stack to set up before generating framework-specific code.
`.trim();

const REACT_NATIVE_BRIEF = `
The project framework is REACT NATIVE (Expo): a native-feel mobile app.
- Stack: Expo + NativeWind (Tailwind for RN) + React Navigation + Zustand + React Query. TypeScript throughout.
- NEVER use DOM APIs, CSS stylesheets, <div>/<span>, or web-only libraries. Use React Native primitives (View/Text/Pressable/FlatList) and expo packages.
- Install packages with the JS package manager (Expo-compatible packages only; never another platform's toolchain or language packages).
- Preview runs via \`npx expo start\` inside the phone/tablet device frame; the app must fill the frame (100% width, no fake bezels).
- Touch targets ≥ 44px; respect safe areas; tablet-adaptive layouts.
`.trim();

const FLUTTER_BRIEF = `
The project framework is FLUTTER: a native-feel mobile app written in Dart.
- Stack: Flutter + Riverpod (state) + GoRouter (navigation) + Dio (networking).
- NEVER emit another stack's code: Dart-only, under lib/.
- Manage packages with \`flutter pub add\` / \`flutter pub get\`; format with \`dart format\`; analyze with \`flutter analyze\`.
- Preview runs via \`flutter run -d web-server\` inside the phone/tablet device frame; Material 3 widgets, adaptive for tablets.
- Touch targets ≥ 48px on Android profiles (44px iOS); respect safe areas (SafeArea).
`.trim();

const WEBSITE_BRIEF = `
The project framework is WEBSITE (Vite + React): a responsive web app.
- Stack: Vite + React + TypeScript + Tailwind CSS v4 + TanStack Router + Zustand + React Query.
- Source lives in src/ (pages/routes, components); style with Tailwind utilities, not stylesheets per component.
- Preview runs via the Vite dev server in a browser iframe; layouts must reflow at mobile (<640px), tablet (640–1024px), desktop (>1024px).
- Desktop-first canvas: top navbar or sidebar navigation (never a bottom tab bar); full mouse + keyboard + touch parity with visible focus states.
`.trim();

export const CAIDE_FRAMEWORK_BRIEFS: Record<CaideFramework, string> = {
  blank: BLANK_BRIEF,
  "react-native": REACT_NATIVE_BRIEF,
  flutter: FLUTTER_BRIEF,
  website: WEBSITE_BRIEF,
};

/**
 * Framework notice prepended to every assembled system prompt (all four
 * modes). Donor prompt text below it is untouched.
 */
export function buildFrameworkNotice(framework: CaideFramework): string {
  return `<caide_framework>
${CAIDE_FRAMEWORK_BRIEFS[framework]}
The framework above is IMMUTABLE for this project — it controls scaffold, prompts, tools, preview, build, and artifacts. Never suggest switching stacks or emitting another framework's code.
</caide_framework>`;
}

// ============================================================================
// Framework isolation: per-framework default rules + target mapping.
// The donor DEFAULT_AI_RULES is React+Vite-flavored — it must NEVER leak into
// Flutter prompts (and Dart/flutter-pub must never leak into web/RN prompts).
// ============================================================================

const REACT_NATIVE_AI_RULES = `# Tech Stack
- You are building a React Native application with Expo.
- Use TypeScript.
- Use React Navigation for navigation. KEEP the navigation structure in the app entry.
- Always put source code in the app/src folder (screens, components, hooks, stores).
- Put screens into app/src/screens/ (or app/ per the scaffold's router).
- Put components into app/src/components/.
- UPDATE the entry/navigator to include new screens. OTHERWISE, the user can NOT see them!
- ALWAYS try to use NativeWind (Tailwind for React Native) for styling.
- Use React Native primitives only (View/Text/Pressable/FlatList) — no DOM, no <div>, no CSS stylesheets.
- State with Zustand, server state with React Query.

Available packages and libraries:
- Use lucide-react-native or Expo vector icons for icons.
- Only install Expo-compatible packages (managed workflow). Never suggest another platform's toolchain or language packages.
`;

const FLUTTER_AI_RULES = `# Tech Stack
- You are building a Flutter application.
- Use Dart, null-safe. Follow flutter_lints.
- Use GoRouter for navigation. KEEP the routes in lib/router.dart (or the scaffold's router file).
- Always put source code in the lib folder.
- Put screens into lib/screens/ (or lib/features/<feature>/).
- Put widgets into lib/widgets/.
- UPDATE the router/entry to include new screens. OTHERWISE, the user can NOT see them!
- Use Material 3 widgets and the app theme — no hardcoded colors outside the theme.
- State with Riverpod, networking with Dio.
- Manage packages with the Dart package tool. Dart-only project: no other stack's installer, language, or UI toolkit.
`;

const BLANK_AI_RULES = `# Tech Stack
- The project framework is Blank: an empty workspace with no stack yet.
- Inspect the workspace before assuming any language, framework, or package manager.
- There is no preview and no build pipeline — say so explicitly instead of failing silently.
- Ask the user which stack to set up before generating framework-specific code.
- NEVER emit React, Dart, npm, or flutter commands unprompted.
`;

/**
 * Default AI rules for a Caide framework. Website reuses the donor React+Vite
 * rules (imported by the constructors); every other framework gets its own
 * stack rules so donor React-isms never leak across frameworks. An explicit
 * per-project AI_RULES.md always wins — pass it as `aiRules` instead.
 */
export function defaultAiRulesForFramework(
  framework: CaideFramework | undefined,
  websiteRules: string,
): string | undefined {
  switch (framework) {
    case "react-native":
      return REACT_NATIVE_AI_RULES;
    case "flutter":
      return FLUTTER_AI_RULES;
    case "blank":
      return BLANK_AI_RULES;
    case "website":
      return websiteRules;
    default:
      return undefined;
  }
}

/**
 * Framework → product-target mapping. React Native and Flutter are mobile
 * (bottom-tab, touch-first skill pack); Website is web (responsive skill
 * pack). Used to derive `appTarget` when the caller only knows the framework.
 */
export function appTargetForFramework(
  framework: CaideFramework | undefined,
): "mobile" | "web" | undefined {
  if (framework === "website") return "web";
  if (framework === "react-native" || framework === "flutter") return "mobile";
  return undefined;
}

// ============================================================================
// Framework command terms: the donor Rebuild/import guidance says "npm".
// Correct per framework (donor-exact when no framework is set).
// ============================================================================

const NPM_REINSTALL_SENTENCE =
  "then it re-installs the npm packages and then starts";

const NPM_IMPORT_SENTENCE = "anything that would come from npm";

/**
 * Rewrite donor npm-isms for non-npm frameworks. Returns the prompt
 * unchanged for website/blank/unset (donor-exact).
 */
export function applyFrameworkCommandTerms(
  prompt: string,
  framework: CaideFramework | undefined,
): string {
  if (framework === "flutter") {
    return prompt
      .split(NPM_REINSTALL_SENTENCE)
      .join("then it re-runs the Dart package fetch and then starts")
      .split(NPM_IMPORT_SENTENCE)
      .join("anything that would come from a Dart package");
  }
  if (framework === "react-native") {
    return prompt
      .split(NPM_REINSTALL_SENTENCE)
      .join("then it re-installs the JavaScript packages and then starts")
      .split(NPM_IMPORT_SENTENCE)
      .join("anything that would come from the package manager");
  }
  return prompt;
}

// ============================================================================
// Framework path terms: donor inspection/dir rules cite React web paths.
// Correct per framework (donor-exact when unset/website).
// ============================================================================

const AGENT_INSPECTION_EXAMPLES =
  "(e.g. `src/pages/`, `components/`, `src/pages/Profile.tsx`, or `lib/toast`)";
const BUILD_INSPECTION_EXAMPLES =
  "(e.g. `src/pages/`, `Profile.tsx`, `lib/toast`)";
const DIR_RULE_SENTENCE =
  "Directory names MUST be all lower-case (src/pages, src/components, etc.). File names may use mixed-case if you like.";

const FLUTTER_AGENT_INSPECTION =
  "(e.g. `lib/screens/`, `widgets/`, `lib/screens/profile.dart`, or `lib/utils/toast.dart`)";
const FLUTTER_BUILD_INSPECTION =
  "(e.g. `lib/screens/`, `profile.dart`, `lib/utils/toast.dart`)";
const FLUTTER_DIR_RULE =
  "Directory names MUST be all lower-case (lib/screens, lib/widgets, etc.). File names use snake_case Dart convention (profile_card.dart).";

const RN_AGENT_INSPECTION =
  "(e.g. `app/src/screens/`, `components/`, `app/src/screens/Profile.tsx`, or `lib/toast`)";
const RN_BUILD_INSPECTION =
  "(e.g. `app/src/screens/`, `Profile.tsx`, `lib/toast`)";
const RN_DIR_RULE =
  "Directory names MUST be all lower-case (app/src/screens, app/src/components, etc.). File names may use mixed-case if you like.";

/**
 * Rewrite donor React-web path examples for mobile frameworks. Donor-exact
 * for website/blank/unset.
 */
export function applyFrameworkPathTerms(
  prompt: string,
  framework: CaideFramework | undefined,
): string {
  if (framework === "flutter") {
    return prompt
      .split(AGENT_INSPECTION_EXAMPLES)
      .join(FLUTTER_AGENT_INSPECTION)
      .split(BUILD_INSPECTION_EXAMPLES)
      .join(FLUTTER_BUILD_INSPECTION)
      .split(DIR_RULE_SENTENCE)
      .join(FLUTTER_DIR_RULE);
  }
  if (framework === "react-native") {
    return prompt
      .split(AGENT_INSPECTION_EXAMPLES)
      .join(RN_AGENT_INSPECTION)
      .split(BUILD_INSPECTION_EXAMPLES)
      .join(RN_BUILD_INSPECTION)
      .split(DIR_RULE_SENTENCE)
      .join(RN_DIR_RULE);
  }
  return prompt;
}

// ============================================================================
// Framework build examples + toast guidance: donor Example 1-3 blocks are
// React+Vite code. React Native keeps them with corrected paths (React code
// is valid); Flutter gets compact Dart equivalents; the Sonner toast line is
// swapped per framework. Donor-exact for website/blank/unset.
// ============================================================================

const DONOR_TOAST_LINE =
  `- Use toast components to inform the user about important events. Prefer Sonner (already installed in the scaffold as 'import { toast } from "sonner"') over any other toast library.`;

const RN_TOAST_LINE = `- Use the scaffold's toast utility to inform the user about important events.`;

const FLUTTER_TOAST_LINE = `- Use ScaffoldMessenger SnackBars to inform the user about important events. Never add a web toast package.`;

const EXAMPLES_START_MARKER = "## Example 1: Adding a new component";
const EXAMPLES_END_MARKER = "# Additional Guidelines";

const EXAMPLE_2_START_MARKER = "## Example 2: Showing a toast notification";
const EXAMPLE_3_START_MARKER = "## Example 3: Renaming and deleting files";

const RN_BUILD_EXAMPLE_2 = `## Example 2: Showing a toast notification

### User prompt

I want to show a success toast when the form is submitted.

### System response

The scaffold includes a toast utility — no installation needed.

<dyad-write path="app/src/components/SubmitForm.tsx" description="Adding a success toast on form submit.">
import { Pressable, Text } from "react-native";
import { showToast } from "../lib/toast";

export function SubmitForm() {
  const handleSubmit = async () => {
    try {
      // your submit logic here
      showToast("Saved successfully!");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <Pressable onPress={handleSubmit}>
      <Text>Submit</Text>
    </Pressable>
  );
}
</dyad-write>
<dyad-chat-summary>Adding toast on form submit</dyad-chat-summary>
Added a success toast using the scaffold toast utility. The toast fires on successful submit and shows an error message if something fails.

`;

const FLUTTER_BUILD_EXAMPLES = `## Example 1: Adding a new widget

<dyad-write path="lib/widgets/app_button.dart" description="Creating a reusable AppButton widget with theme styling">
import 'package:flutter/material.dart';

enum AppButtonVariant { primary, secondary, danger }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.variant = AppButtonVariant.primary,
    this.onPressed,
  });

  final String label;
  final AppButtonVariant variant;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background = switch (variant) {
      AppButtonVariant.primary => scheme.primary,
      AppButtonVariant.secondary => scheme.secondaryContainer,
      AppButtonVariant.danger => scheme.error,
    };
    return FilledButton(
      style: FilledButton.styleFrom(backgroundColor: background),
      onPressed: onPressed,
      child: Text(label),
    );
  }
}
</dyad-write>

<dyad-write path="lib/screens/home_screen.dart" description="Updating the home screen to use the new AppButton widget.">
import 'package:flutter/material.dart';
import '../widgets/app_button.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Application')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            AppButton(label: 'Primary action', onPressed: () {}),
            const SizedBox(height: 8),
            AppButton(
              label: 'Secondary action',
              variant: AppButtonVariant.secondary,
              onPressed: () {},
            ),
          ],
        ),
      ),
    );
  }
}
</dyad-write>
<dyad-chat-summary>Adding a new widget</dyad-chat-summary>

## Example 2: Showing a confirmation message

### User prompt

I want to show a success message when the form is submitted.

### System response

Use ScaffoldMessenger — no extra package needed.

<dyad-write path="lib/screens/contact_form.dart" description="Adding a SnackBar confirmation on form submit.">
import 'package:flutter/material.dart';

class ContactForm extends StatelessWidget {
  const ContactForm({super.key});

  Future<void> _handleSubmit(BuildContext context) async {
    try {
      // your submit logic here
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved successfully!')),
      );
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Something went wrong')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: () => _handleSubmit(context),
      child: const Text('Submit'),
    );
  }
}
</dyad-write>
<dyad-chat-summary>Adding SnackBar on form submit</dyad-chat-summary>
Added a success SnackBar via ScaffoldMessenger. It fires on successful submit and shows an error message if something fails.

## Example 3: Renaming and deleting files

<dyad-rename from="lib/widgets/user_profile.dart" to="lib/widgets/profile_card.dart"></dyad-rename>

<dyad-write path="lib/widgets/profile_card.dart" description="Updating the ProfileCard widget with better styling.">
import 'package:flutter/material.dart';

class ProfileCard extends StatelessWidget {
  const ProfileCard({super.key, required this.name, required this.email, this.avatarUrl});

  final String name;
  final String email;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl!) : null,
              child: avatarUrl == null ? const Icon(Icons.person) : null,
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: Theme.of(context).textTheme.titleMedium),
                Text(email, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
</dyad-write>

<dyad-delete path="lib/widgets/analytics.dart"></dyad-delete>

<dyad-write path="lib/screens/dashboard_screen.dart" description="Updating imports in files that were using these widgets.">
import 'package:flutter/material.dart';
import '../widgets/profile_card.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: const Padding(
        padding: EdgeInsets.all(16),
        child: ProfileCard(name: 'Ada', email: 'ada@example.com'),
      ),
    );
  }
}
</dyad-write>
<dyad-chat-summary>Renaming profile file</dyad-chat-summary>
I've renamed the UserProfile widget to ProfileCard, updated its styling, removed an unused Analytics widget, and updated imports in the dashboard screen.

`;

/**
 * Rewrite donor build-mode examples + toast guidance per framework.
 * Donor-exact for website/blank/unset.
 */
export function applyFrameworkBuildExamples(
  prompt: string,
  framework: CaideFramework | undefined,
): string {
  if (framework === "flutter") {
    const start = prompt.indexOf(EXAMPLES_START_MARKER);
    const end = prompt.indexOf(EXAMPLES_END_MARKER);
    let out = prompt;
    if (start !== -1 && end !== -1 && end > start) {
      out = prompt.slice(0, start) + FLUTTER_BUILD_EXAMPLES + prompt.slice(end);
    }
    return out.split(DONOR_TOAST_LINE).join(FLUTTER_TOAST_LINE);
  }
  if (framework === "react-native") {
    let out = prompt
      .split("src/pages/")
      .join("app/src/screens/")
      .split("src/pages")
      .join("app/src/screens")
      .split("src/components/")
      .join("app/src/components/")
      .split(DONOR_TOAST_LINE)
      .join(RN_TOAST_LINE);
    const start = out.indexOf(EXAMPLE_2_START_MARKER);
    const end = out.indexOf(EXAMPLE_3_START_MARKER);
    if (start !== -1 && end !== -1 && end > start) {
      out = out.slice(0, start) + RN_BUILD_EXAMPLE_2 + out.slice(end);
    }
    return out;
  }
  return prompt;
}
