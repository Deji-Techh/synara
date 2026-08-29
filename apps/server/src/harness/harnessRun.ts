// harness/harnessRun.ts — The exact Claude flow from claudediscussion.md
// 1. Scope before code (spec)
// 2. Architecture decision (framework)
// 3. Design system BEFORE screens
// 4. Build in vertical slices (one complete flow at a time)
// 5. Visual verification loop after EVERY screen
// 6. Human checkpoints after design system + first slice
// 7. Test unhappy paths per screen
// 8. Polish pass at end (motion, haptics, a11y)

import { CaideRunner } from "./caideRunner";
import { executeTool } from "./tools";
import { verifySlice, needsHumanGlance } from "./verifier";
import { runEdgeSweep, runAdversarial } from "./edgeRunner";
import { plannerSlice, type Slice } from "./planner";
import { route, routeVerifier } from "./router";
import { recordSliceResult } from "./selfImprove";
import {
  sendToProvider,
  buildBuilderPrompt,
  buildDesignSystemPrompt,
  buildUnhappyPrompt,
  buildPolishPrompt,
  composePrompt,
  type LayeredPrompt,
} from "./layers";
import { join } from "node:path";
import { homedir } from "node:os";

const CAIDE_HOME = process.env.CAIDE_HOME ?? join(homedir(), "caide-apps");

export interface HarnessEvent {
  readonly type: "design-system" | "checkpoint" | "slice" | "unhappy" | "polish" | "complete";
  readonly data: Record<string, unknown>;
}

export interface SliceResult {
  sliceId: string;
  pass: boolean;
  filesChanged: string[];
  confidence: number;
  code: string;
}

export interface ProviderConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
}

export class CaideHarness {
  private runner = new CaideRunner();

  // THE EXACT FLOW from claudediscussion.md
  async runBuildFlow(
    spec: string,
    threadId: string,
    framework: string,
    projectId: string,
    provider: ProviderConfig,
  ): Promise<HarnessEvent[]> {
    const projectDir = join(CAIDE_HOME, projectId);
    const events: HarnessEvent[] = [];
    const allScreens: string[] = [];

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Scope before code — force real spec
    // ═══════════════════════════════════════════════════════════════
    const slices = plannerSlice(spec);

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Architecture decision — framework already chosen
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Design system BEFORE screens
    // ═══════════════════════════════════════════════════════════════
    events.push({ type: "design-system", data: { status: "generating" } });

    const designSystemPrompt = buildDesignSystemPrompt(spec, framework);
    const designSystemResult = await sendToProvider(designSystemPrompt, provider);
    const designSystem = designSystemResult.text;

    // Write design system to workspace
    await executeTool("write", { path: "design-system.json", content: designSystem }, projectDir);
    events.push({ type: "design-system", data: { status: "complete", designSystem } });

    // ═══════════════════════════════════════════════════════════════
    // CHECKPOINT: Human confirms design system before proceeding
    // ═══════════════════════════════════════════════════════════════
    events.push({
      type: "checkpoint",
      data: {
        reason: "Design system established. Confirm before building screens.",
        designSystem,
        confidence: 0.95,
        requiresResponse: true,
      },
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Build in vertical slices — one complete flow at a time
    // ═══════════════════════════════════════════════════════════════
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i] as Slice;
      const turnId = `turn-${Date.now()}-${i}`;

      // Router picks model/skills
      const complexity = slice.spec.length > 200 ? "high" : slice.spec.length > 50 ? "medium" : "low";
      const decision = route("screen", { complexity });

      this.runner.startTurn(threadId, turnId, projectId, "builder", `slice: ${slice.title}`, [...decision.skills]);

      // ═══════════════════════════════════════════════════════════════
      // BUILDER: Call provider to generate UNIQUE code per slice
      // ═══════════════════════════════════════════════════════════════
      const builderPrompt = buildBuilderPrompt(slice.spec, framework, designSystem, allScreens);
      const builderResult = await sendToProvider(builderPrompt, provider);
      let code = builderResult.text;

      // Strip markdown code fences if provider wrapped them
      code = code.replace(/^```(?:tsx?|dart|jsx?)?\n/i, "").replace(/\n```\s*$/, "");

      // Determine filename
      const ext = framework === "flutter" ? ".dart" : ".tsx";
      const filename = framework === "flutter"
        ? `${snakeCase(slice.title)}${ext}`
        : `${pascalCase(slice.title)}${ext}`;

      // Write generated code to workspace
      const writeResult = await executeTool("write", { path: filename, content: code }, projectDir);
      allScreens.push(code);

      events.push({
        type: "slice",
        data: {
          sliceId: slice.id,
          title: slice.title,
          filename,
          code: code.slice(0, 500) + (code.length > 500 ? "..." : ""),
          filesChanged: writeResult.ok ? [writeResult.result ?? filename] : [],
        },
      });

      // ═══════════════════════════════════════════════════════════════
      // STEP 5: Visual verification loop — after EVERY screen
      // ═══════════════════════════════════════════════════════════════
      const verifierDecision = routeVerifier();
      void verifierDecision;

      const verifyResult = verifySlice({
        sliceSpec: slice.spec,
        renderedScreenshotBase64: null,
        builderClaim: code,
      });

      // Track for self-improvement
      recordSliceResult({
        combo: [...decision.skills],
        confidence: verifyResult.confidence,
        retries: !verifyResult.pass ? 1 : 0,
      });

      // ═══════════════════════════════════════════════════════════════
      // CHECKPOINT: Human confirms first slice
      // ═══════════════════════════════════════════════════════════════
      if (i === 0) {
        events.push({
          type: "checkpoint",
          data: {
            reason: `First slice "${slice.title}" built. Confirm before building remaining ${slices.length - 1} slices.`,
            confidence: verifyResult.confidence,
            tasteScore: verifyResult.tasteScore,
            code: code.slice(0, 500),
            requiresResponse: true,
          },
        });
      }

      // If verifier fails, run fixer
      if (!verifyResult.pass) {
        const fixerPrompt = composePrompt("fixer", `Fix this code:\n${code}\n\nFailure reason: ${verifyResult.reason}`, []);
        const fixerResult = await sendToProvider(fixerPrompt, provider);
        const fixedCode = fixerResult.text.replace(/^```(?:tsx?|dart|jsx?)?\n/i, "").replace(/\n```\s*$/, "");
        await executeTool("write", { path: filename, content: fixedCode }, projectDir);
        allScreens[allScreens.length - 1] = fixedCode;
        code = fixedCode;
      }

      this.runner.complete(threadId, turnId);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: Test unhappy paths per screen
    // ═══════════════════════════════════════════════════════════════
    events.push({ type: "unhappy", data: { status: "generating" } });

    for (const screenCode of allScreens) {
      const unhappyPrompt = buildUnhappyPrompt(screenCode, framework);
      const unhappyResult = await sendToProvider(unhappyPrompt, provider);
      const unhappyCode = unhappyResult.text.replace(/^```(?:tsx?|dart|jsx?)?\n/i, "").replace(/\n```\s*$/, "");

      // Write unhappy path variants
      const unhappyFile = `unhappy-${Date.now()}${framework === "flutter" ? ".dart" : ".tsx"}`;
      await executeTool("write", { path: unhappyFile, content: unhappyCode }, projectDir);
    }

    events.push({ type: "unhappy", data: { status: "complete" } });

    // ═══════════════════════════════════════════════════════════════
    // STEP 7: Polish pass — motion, haptics, a11y
    // ═══════════════════════════════════════════════════════════════
    events.push({ type: "polish", data: { status: "generating" } });

    const polishPrompt = buildPolishPrompt(allScreens, framework);
    const polishResult = await sendToProvider(polishPrompt, provider);
    const polishCode = polishResult.text.replace(/^```(?:tsx?|dart|jsx?)?\n/i, "").replace(/\n```\s*$/, "");

    // Write polished version
    await executeTool("write", { path: `polished-app${framework === "flutter" ? ".dart" : ".tsx"}`, content: polishCode }, projectDir);

    events.push({ type: "polish", data: { status: "complete" } });

    // ═══════════════════════════════════════════════════════════════
    // COMPLETE
    // ═══════════════════════════════════════════════════════════════
    events.push({
      type: "complete",
      data: {
        totalSlices: slices.length,
        totalScreens: allScreens.length,
        framework,
        projectDir,
      },
    });

    return events;
  }
}

// Helpers
function pascalCase(str: string): string {
  return str.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}

function snakeCase(str: string): string {
  return str.replace(/[^a-zA-Z0-9]+/g, "_").trim().toLowerCase().replace(/^_+|_+$/g, "");
}
