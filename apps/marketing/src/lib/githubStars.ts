const GITHUB_REPO_API_URL = "https://api.github.com/repos/Deji-Techh/synara";

export async function getStars(): Promise<number | null> {
  if (process.env.VISUAL_TEST === "1") return 1840;
  try {
    const res = await fetch(GITHUB_REPO_API_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return 1840;
    const data = await res.json();
    return data.stargazers_count ?? 1840;
  } catch {
    return 1840;
  }
}

export function formatStars(count: number): string {
  if (count >= 1000) {
    const k = count / 1000;
    return k >= 100 ? `${Math.round(k)}K` : `${k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return count.toString();
}
