import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { docsSource } from "@/lib/docs";
import { ChevronRight } from "lucide-react";
import { SiX, SiGithub } from "react-icons/si";

type DocumentationPageProps = {
  params: Promise<{ slug?: string[] }>;
};

export default async function DocumentationPage({ params }: DocumentationPageProps) {
  const { slug } = await params;
  const page = docsSource.getPage(slug);

  if (!page) notFound();

  const Content = page.data.body;

  const breadcrumbs = [
    { label: "Docs", href: "/docs" },
    ...(slug && slug.length > 1
      ? [{ label: slug[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), href: `/docs/${slug[0]}` }]
      : []),
    { label: page.data.title, href: page.url },
  ];

  return (
    <DocsPage toc={page.data.toc}>
      {/* Breadcrumb Trail */}
      <nav aria-label="Breadcrumbs" className="mb-4 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text-tertiary)]">
        <Link href="/" className="transition-colors hover:text-[var(--text-primary)]">
          Home
        </Link>
        {breadcrumbs.map((crumb, idx) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <ChevronRight className="size-3 text-[var(--divide)]" />
            {idx === breadcrumbs.length - 1 ? (
              <span className="text-[var(--text-secondary)]">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="transition-colors hover:text-[var(--text-primary)]">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <DocsTitle className="text-[1.75rem] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[2.25rem]">
        {page.data.title}
      </DocsTitle>

      {page.data.description && (
        <DocsDescription className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          {page.data.description}
        </DocsDescription>
      )}

      <DocsBody>
        <Content />

        {/* Footer Help & Community Card */}
        <div className="mt-14 rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="font-semibold text-[var(--text-primary)] text-[14px]">
                <span>Ready to build with Caide?</span>
              </div>
              <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
                Join our early access whitelist to test native desktop builds, copy-on-write database branches, and DeviceLab.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/install"
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] px-4 py-1.5 text-[12px] font-medium text-[var(--btn-primary-fg)] shadow-sm transition-all hover:opacity-90"
              >
                <span>Join Whitelist</span>
              </Link>
              <a
                href="https://x.com/caideorg"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow on X"
                className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--divide)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--mock-row)] hover:text-[var(--text-primary)]"
              >
                <SiX className="size-3" />
              </a>
              <a
                href="https://github.com/caideorg/caide"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Star on GitHub"
                className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--divide)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--mock-row)] hover:text-[var(--text-primary)]"
              >
                <SiGithub className="size-3.5" />
              </a>
            </div>
          </div>
        </div>
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return docsSource.generateParams();
}

export async function generateMetadata({ params }: DocumentationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = docsSource.getPage(slug);
  if (!page) return {};
  return {
    title: `${page.data.title} — Caide Docs`,
    description: page.data.description,
  };
}
