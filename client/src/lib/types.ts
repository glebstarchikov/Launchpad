export type ProjectStage = "idea" | "building" | "beta" | "live" | "growing" | "sunset";
export type ProjectType = "for-profit" | "open-source";
export type IdeaStatus = "raw" | "promoted";

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: number;
  updated_at: number;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  url: string | null;
  type: ProjectType;
  stage: ProjectStage;
  tech_stack: string;
  last_deployed: number | null;
  created_at: number;
  updated_at: number;
  starred: 0 | 1;
  github_repo: string | null;
}

export interface ProjectLink {
  id: string;
  project_id: string;
  label: string;
  url: string;
  icon: string | null;
}

export interface ProjectCountry {
  id: string;
  project_id: string;
  country_code: string;
  country_name: string;
}

export type LegalPriority = "blocker" | "important" | "recommended";
export type LegalCategory = "privacy" | "tax" | "terms" | "ip" | "accessibility" | "data" | "corporate";

export interface LegalResource {
  label: string;
  url: string;
}

export interface LegalItem {
  id: string;
  project_id: string;
  country_code: string;
  item: string;
  completed: 0 | 1;
  created_at: number;
  priority: LegalPriority | null;
  category: LegalCategory | null;
  why: string | null;
  action: string | null;
  resources: LegalResource[];
  scope: "country" | "region";
  scope_code: string | null;
  last_reviewed_at: number | null;
  status_note: string | null;
}

export interface LegalReviewMissingItem {
  item: string;
  priority: LegalPriority;
  category: LegalCategory;
  why: string;
  action: string;
  resources: LegalResource[];
  country_code: string;
  scope: "country" | "region";
  scope_code: string | null;
}

export interface LegalReviewDiff {
  ok: string[];
  stale: { id: string; status_note: string }[];
  rename: { id: string; new_item: string }[];
  missing: LegalReviewMissingItem[];
  removed: string[];
}

export type ChecklistCategory = "validation" | "build" | "infra" | "legal" | "marketing" | "launch" | "growth";

export interface LaunchChecklistItem {
  id: string;
  project_id: string;
  item: string;
  completed: 0 | 1;
  category: ChecklistCategory | null;
  min_stage: ProjectStage | null;
  sort_order: number;
  created_at: number;
}

export interface MrrEntry {
  id: string;
  project_id: string;
  mrr: number;
  user_count: number;
  recorded_at: number;
}

export interface Goal {
  id: string;
  project_id: string;
  description: string;
  target_value: number;
  current_value: number;
  unit: string | null;
  target_date: number | null;
  completed: 0 | 1;
  created_at: number;
}

export interface Idea {
  id: string;
  user_id: string;
  title: string;
  body: string;
  status: IdeaStatus;
  promoted_to_project_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface Note {
  id: string;
  project_id: string;
  content: string;
  is_build_log: 0 | 1;
  created_at: number;
}

export type TechDebtSeverity = "low" | "medium" | "high";
export type TechDebtCategory = "bug" | "refactor" | "security" | "performance" | "docs";
export type TechDebtEffort = "quick" | "moderate" | "significant";

export interface TechDebtItem {
  id: string;
  project_id: string;
  note: string;
  resolved: 0 | 1;
  severity: TechDebtSeverity | null;
  category: TechDebtCategory | null;
  effort: TechDebtEffort | null;
  created_at: number;
}

export interface FileRecord {
  id: string;
  project_id: string | null;
  user_id: string;
  filename: string;
  original_name: string;
  mimetype: string;
  size: number;
  uploaded_at: number;
}

export interface DashboardData {
  mrr: number;
  projectCount: number;
  ideaCount: number;
  legalPending: number;
  stageDist: { stage: ProjectStage; count: number }[];
  recentProjects: Pick<Project, "id" | "name" | "stage" | "type" | "url" | "updated_at">[];
  recentIdeas: Pick<Idea, "id" | "title" | "body" | "created_at">[];
}

export interface DailySummary {
  id: string;
  summary: string;
  date: string;
  created_at: number;
  cached?: boolean;
  activity_data?: string;
}

export interface LLMHealth {
  available: boolean;
  model: string;
  error?: string;
}

export interface NewsItem {
  id: string;
  user_id: string;
  source: string;
  source_id: string | null;
  title: string;
  url: string | null;
  summary: string | null;
  relevance_score: number | null;
  relevance_reason: string | null;
  read: 0 | 1;
  created_at: number;
}

export interface NewsSource {
  id: string;
  user_id: string;
  type: string;
  name: string;
  url: string | null;
  enabled: 0 | 1;
  created_at: number;
}

export interface WhisperHealth {
  available: boolean;
  model: string;
  error?: string;
}

export interface VoiceIdeaResult {
  idea: Idea;
  transcript: string;
  audioFileId: string;
  whisperAvailable: boolean;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: string;
  created_at: string;
  url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  labels: string[];
  created_at: string;
  url: string;
}

export interface GitHubRepoData {
  connected: boolean;
  repo: string | null;
  commits: GitHubCommit[];
  prs: GitHubPR[];
  issues: GitHubIssue[];
  error?: string;
}

export interface GitHubActivity {
  project: string;
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}
