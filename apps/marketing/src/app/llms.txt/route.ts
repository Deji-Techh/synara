import { NextResponse } from "next/server";
import { PRODUCT_NAME, PRODUCT_DESCRIPTION, PRODUCT_PILLARS, SUPPORTED_FRAMEWORKS } from "@/data/product";

export async function GET() {
  const content = `# ${PRODUCT_NAME}

> ${PRODUCT_DESCRIPTION}

## Frameworks
${SUPPORTED_FRAMEWORKS.map((f) => `- **${f.name}**: ${f.description}`).join("\n")}

## Architecture Pillars
${PRODUCT_PILLARS.map((p) => `- **${p.title}**: ${p.description}`).join("\n")}
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
