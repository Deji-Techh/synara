import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { docsSource } from "@/lib/docs";
import { docsLayoutOptions } from "@/lib/docsLayout";

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...docsLayoutOptions()}
      tree={docsSource.getPageTree()}
      sidebar={{ collapsible: true, defaultOpenLevel: 6, prefetch: false }}
      tabs={false}
    >
      {children}
    </DocsLayout>
  );
}
