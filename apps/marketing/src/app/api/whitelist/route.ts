import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export interface WhitelistEntry {
  id: string;
  name: string;
  email: string;
  framework?: string;
  role?: string;
  preferredModel?: string;
  notes?: string;
  createdAt: string;
  userAgent?: string;
}

const DATA_FILE = path.join(process.cwd(), "src/data/whitelist_submissions.json");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, framework, role, preferredModel, notes } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!email || typeof email !== "string" || !email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }

    const entry: WhitelistEntry = {
      id: `wl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      framework: typeof framework === "string" ? framework.trim() : undefined,
      role: typeof role === "string" ? role.trim() : undefined,
      preferredModel: typeof preferredModel === "string" ? preferredModel.trim() : undefined,
      notes: typeof notes === "string" ? notes.trim() : undefined,
      createdAt: new Date().toISOString(),
      userAgent: request.headers.get("user-agent") ?? undefined,
    };

    // Read existing submissions or initialize empty array
    let submissions: WhitelistEntry[] = [];
    try {
      const fileData = await fs.readFile(DATA_FILE, "utf-8");
      submissions = JSON.parse(fileData);
      if (!Array.isArray(submissions)) submissions = [];
    } catch {
      submissions = [];
    }

    // Check if email already registered (update or keep existing)
    const existingIndex = submissions.findIndex(
      (s) => s.email.toLowerCase() === entry.email.toLowerCase(),
    );
    if (existingIndex >= 0) {
      submissions[existingIndex] = {
        ...submissions[existingIndex],
        ...entry,
        id: submissions[existingIndex].id,
      };
    } else {
      submissions.push(entry);
    }

    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(submissions, null, 2), "utf-8");

    // Optional webhook forwarding if configured in environment
    const webhookUrl = process.env.WHITELIST_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `**New Caide Whitelist Submission**\n- **Name:** ${entry.name}\n- **Email:** ${entry.email}\n- **Framework:** ${entry.framework || "N/A"}\n- **Role:** ${entry.role || "N/A"}\n- **Model:** ${entry.preferredModel || "N/A"}\n- **Notes:** ${entry.notes || "None"}`,
          }),
        });
      } catch (webhookErr) {
        console.warn("Whitelist webhook dispatch notice:", webhookErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Successfully joined the Caide early access whitelist",
      entry: { id: entry.id, email: entry.email },
    });
  } catch (error) {
    console.error("Failed to process whitelist submission:", error);
    return NextResponse.json(
      { error: "Internal server error processing submission" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const fileData = await fs.readFile(DATA_FILE, "utf-8");
    const submissions: WhitelistEntry[] = JSON.parse(fileData);
    return NextResponse.json({
      count: submissions.length,
      submissions: submissions.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        framework: s.framework,
        role: s.role,
        createdAt: s.createdAt,
      })),
    });
  } catch {
    return NextResponse.json({ count: 0, submissions: [] });
  }
}
