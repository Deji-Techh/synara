import { z } from "zod";
import { ToolDefinition, AgentContext, escapeXmlContent } from "./types";
import { getNeonProjectInfo } from "../../../../../../neon_admin/neon_context";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";

// At least one property is needed because Vertex AI rejects empty parameter schemas.
const getNeonProjectInfoSchema = z.object({
  _reserved: z
    .boolean()
    .optional()
    .describe(
      "Reserved placeholder because some model providers reject empty parameter schemas. Leave this unset.",
    ),
});

export const getNeonProjectInfoTool: ToolDefinition<
  z.infer<typeof getNeonProjectInfoSchema>
> = {
  name: "get_neon_project_info",
  description:
    "Get Neon project overview: project ID, branches, and table names. Use this to discover what tables exist before fetching detailed schemas.",
  inputSchema: getNeonProjectInfoSchema,
  defaultConsent: "always",
  isEnabled: (ctx) => !!ctx.neonProjectId && !!ctx.neonActiveBranchId,

  getConsentPreview: () => "Get Neon project info",

  execute: async (_args, ctx: AgentContext) => {
    if (!ctx.neonProjectId || !ctx.neonActiveBranchId) {
      throw new CaideError(
        "Neon is not connected to this app",
        CaideErrorKind.Precondition,
      );
    }

    ctx.onXmlStream("<caide-neon-project-info></caide-neon-project-info>");

    const info = await getNeonProjectInfo({
      projectId: ctx.neonProjectId,
      branchId: ctx.neonActiveBranchId,
    });

    ctx.onXmlComplete(
      `<caide-neon-project-info>\n${escapeXmlContent(info)}\n</caide-neon-project-info>`,
    );

    return info;
  },
};
