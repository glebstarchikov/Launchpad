const GITHUB_PAT = process.env.GITHUB_PAT ?? "";
const API_BASE = "https://api.github.com";

interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: string;
  created_at: string;
  url: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  labels: string[];
  created_at: string;
  url: string;
}

async function ghFetch(path: string) {
  if (!GITHUB_PAT) throw new Error("GITHUB_PAT not set");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API error (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function getCommits(repo: string, since?: string): Promise<GitHubCommit[]> {
  const params = new URLSearchParams({ per_page: "10" });
  if (since) params.set("since", since);
  const data = await ghFetch(`/repos/${repo}/commits?${params}`);
  return data.map((c: any) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name ?? c.author?.login ?? "unknown",
    date: c.commit.author?.date ?? "",
    url: c.html_url,
  }));
}

export async function getPRs(repo: string): Promise<GitHubPR[]> {
  const data = await ghFetch(`/repos/${repo}/pulls?state=all&per_page=10&sort=updated&direction=desc`);
  return data.map((pr: any) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    author: pr.user?.login ?? "unknown",
    created_at: pr.created_at,
    url: pr.html_url,
  }));
}

export async function getIssues(repo: string): Promise<GitHubIssue[]> {
  const data = await ghFetch(`/repos/${repo}/issues?state=all&per_page=10&sort=updated&direction=desc`);
  return data
    .filter((i: any) => !i.pull_request)
    .map((i: any) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: (i.labels ?? []).map((l: any) => l.name),
      created_at: i.created_at,
      url: i.html_url,
    }));
}

export async function isGitHubAvailable(): Promise<{ available: boolean; error?: string }> {
  if (!GITHUB_PAT) return { available: false, error: "GITHUB_PAT not set" };
  try {
    await ghFetch("/user");
    return { available: true };
  } catch (e: any) {
    return { available: false, error: e.message };
  }
}

export { type GitHubCommit, type GitHubPR, type GitHubIssue };
