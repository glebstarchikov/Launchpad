export type ProjectStage = "idea" | "building" | "beta" | "live" | "growing" | "sunset";
export type ProjectType = "for-profit" | "open-source";
export type IdeaStatus = "raw" | "promoted";

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
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
  tech_stack: string; // JSON array string
  last_deployed: number | null;
  created_at: number;
  updated_at: number;
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

export interface LegalItem {
  id: string;
  project_id: string;
  country_code: string;
  item: string;
  completed: 0 | 1;
  created_at: number;
}

export interface LaunchChecklistItem {
  id: string;
  project_id: string;
  item: string;
  completed: 0 | 1;
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

export interface TechDebtItem {
  id: string;
  project_id: string;
  note: string;
  resolved: 0 | 1;
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
