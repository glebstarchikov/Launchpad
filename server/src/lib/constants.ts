// Launch checklist defaults — grouped by category, stage-aware, split by project type.
// Sources: ProductHunt launch playbook, YC Startup School, Stripe Atlas, Indie Hackers,
// and general SaaS/OSS launch practices.

export type ChecklistCategory =
  | "validation"
  | "build"
  | "infra"
  | "legal"
  | "marketing"
  | "launch"
  | "growth";

export type ChecklistStage =
  | "idea"
  | "building"
  | "beta"
  | "live"
  | "growing"
  | "sunset";

export type ChecklistPriority = "blocker" | "important" | "recommended";

export interface ChecklistItem {
  item: string;
  category: ChecklistCategory;
  min_stage: ChecklistStage;
  sort_order: number;
  priority?: ChecklistPriority;
}

// Items applicable to both for-profit and open-source projects.
export const CHECKLIST_UNIVERSAL: ChecklistItem[] = [
  // Validation & Research
  { item: "Define target customer persona", category: "validation", min_stage: "idea", sort_order: 100 },
  { item: "Research 3+ direct competitors", category: "validation", min_stage: "idea", sort_order: 110 },
  { item: "Talk to 5+ potential users", category: "validation", min_stage: "idea", sort_order: 120 },
  { item: "Validate the problem is real (evidence, not hypothesis)", category: "validation", min_stage: "idea", sort_order: 130 },
  { item: "Define primary success metric", category: "validation", min_stage: "idea", sort_order: 140 },
  { item: "Write a one-sentence value proposition", category: "validation", min_stage: "idea", sort_order: 150 },

  // Build & MVP
  { item: "Define MVP scope (single paragraph)", category: "build", min_stage: "idea", sort_order: 200 },
  { item: "Create git repository", category: "build", min_stage: "idea", sort_order: 210 },
  { item: "Document local dev environment setup", category: "build", min_stage: "idea", sort_order: 220 },
  { item: "Build core feature #1 (the one thing)", category: "build", min_stage: "idea", sort_order: 230, priority: "blocker" },
  { item: "Write basic README", category: "build", min_stage: "idea", sort_order: 240 },
  { item: "Set up version control branching strategy", category: "build", min_stage: "idea", sort_order: 250 },
  { item: "Document tech stack decisions", category: "build", min_stage: "idea", sort_order: 260 },

  // Technical Infrastructure
  { item: "Set up CI/CD pipeline", category: "infra", min_stage: "building", sort_order: 300 },
  { item: "Configure custom domain", category: "infra", min_stage: "building", sort_order: 310, priority: "blocker" },
  { item: "Install SSL certificate", category: "infra", min_stage: "building", sort_order: 320, priority: "blocker" },
  { item: "Set up uptime monitoring", category: "infra", min_stage: "building", sort_order: 330 },
  { item: "Set up error tracking (Sentry or equivalent)", category: "infra", min_stage: "building", sort_order: 340 },
  { item: "Set up analytics (Plausible / PostHog / etc.)", category: "infra", min_stage: "building", sort_order: 350 },
  { item: "Configure automated backups", category: "infra", min_stage: "building", sort_order: 360 },
  { item: "Set up staging environment", category: "infra", min_stage: "building", sort_order: 370 },
  { item: "Performance baseline (Core Web Vitals)", category: "infra", min_stage: "building", sort_order: 380 },
  { item: "Mobile responsiveness check", category: "infra", min_stage: "building", sort_order: 390 },

  // Legal & Admin
  { item: "Choose business / entity type (or none yet)", category: "legal", min_stage: "building", sort_order: 400 },

  // Marketing & Content
  { item: "Landing page with clear value proposition", category: "marketing", min_stage: "beta", sort_order: 500 },
  { item: "Hero section with demo video or screenshots", category: "marketing", min_stage: "beta", sort_order: 510 },
  { item: "\"About\" page", category: "marketing", min_stage: "beta", sort_order: 520 },
  { item: "Set up Twitter / X account", category: "marketing", min_stage: "beta", sort_order: 530 },
  { item: "Set up LinkedIn page", category: "marketing", min_stage: "beta", sort_order: 540 },
  { item: "SEO basics (meta tags, sitemap, robots.txt)", category: "marketing", min_stage: "beta", sort_order: 550 },
  { item: "Write launch blog post (problem → solution → journey)", category: "marketing", min_stage: "beta", sort_order: 560 },

  // Launch Prep
  { item: "Beta test with 10+ users", category: "launch", min_stage: "beta", sort_order: 600 },
  { item: "Fix all critical bugs", category: "launch", min_stage: "beta", sort_order: 610 },
  { item: "Write launch announcement post", category: "launch", min_stage: "beta", sort_order: 620 },
  { item: "Prepare press kit (logo, screenshots, one-liner, bio)", category: "launch", min_stage: "beta", sort_order: 630 },
  { item: "Decide on launch date", category: "launch", min_stage: "beta", sort_order: 640 },

  // Post-launch Growth
  { item: "Monitor analytics daily for first week", category: "growth", min_stage: "live", sort_order: 700 },
  { item: "Respond to all feedback within 24h", category: "growth", min_stage: "live", sort_order: 710 },
  { item: "Create feedback loop (email, form, or Discord)", category: "growth", min_stage: "live", sort_order: 720 },
  { item: "Iterate based on usage data", category: "growth", min_stage: "live", sort_order: 730 },
  { item: "Document lessons learned", category: "growth", min_stage: "live", sort_order: 740 },
];

// Additional items specific to for-profit projects (paid products, SaaS, etc.).
export const CHECKLIST_FOR_PROFIT: ChecklistItem[] = [
  // Validation
  { item: "Research willingness to pay (surveys, interviews)", category: "validation", min_stage: "idea", sort_order: 160 },
  { item: "Draft pricing strategy (tiers, anchor price)", category: "validation", min_stage: "idea", sort_order: 170 },
  { item: "Identify first 10 target customers (by name)", category: "validation", min_stage: "idea", sort_order: 180 },

  // Build
  { item: "Set up user authentication", category: "build", min_stage: "idea", sort_order: 270 },
  { item: "Define data model for users", category: "build", min_stage: "idea", sort_order: 280 },
  { item: "Plan billing / subscription flow", category: "build", min_stage: "idea", sort_order: 290 },
  { item: "Build customer dashboard", category: "build", min_stage: "building", sort_order: 292 },
  { item: "Build admin dashboard", category: "build", min_stage: "building", sort_order: 294 },

  // Infrastructure
  { item: "Set up transactional email service", category: "infra", min_stage: "building", sort_order: 395 },
  { item: "Set up customer support inbox", category: "infra", min_stage: "building", sort_order: 396 },
  { item: "Configure payment processing", category: "infra", min_stage: "building", sort_order: 397 },
  { item: "Set up webhook handling", category: "infra", min_stage: "building", sort_order: 398 },
  { item: "Define rate limiting", category: "infra", min_stage: "building", sort_order: 399 },
  { item: "Set up secrets management", category: "infra", min_stage: "building", sort_order: 400 },

  // Legal
  { item: "Draft Terms of Service", category: "legal", min_stage: "building", sort_order: 410, priority: "blocker" },
  { item: "Draft Privacy Policy", category: "legal", min_stage: "building", sort_order: 420, priority: "blocker" },
  { item: "Register business entity", category: "legal", min_stage: "building", sort_order: 430 },
  { item: "Set up business bank account", category: "legal", min_stage: "building", sort_order: 440 },
  { item: "Tax registration (as required)", category: "legal", min_stage: "building", sort_order: 450 },
  { item: "Cookie consent banner (if EU users)", category: "legal", min_stage: "building", sort_order: 460 },
  { item: "GDPR compliance basics (if EU users)", category: "legal", min_stage: "building", sort_order: 470 },
  { item: "Accounting / invoicing setup", category: "legal", min_stage: "building", sort_order: 480 },
  { item: "Refund & cancellation policy", category: "legal", min_stage: "building", sort_order: 490 },

  // Marketing
  { item: "Pricing page with clear tiers", category: "marketing", min_stage: "beta", sort_order: 570 },
  { item: "FAQ page", category: "marketing", min_stage: "beta", sort_order: 580 },
  { item: "Case studies / testimonials section", category: "marketing", min_stage: "beta", sort_order: 590 },
  { item: "Customer logos section", category: "marketing", min_stage: "beta", sort_order: 592 },
  { item: "Email capture on landing page", category: "marketing", min_stage: "beta", sort_order: 594 },
  { item: "Write first 5 blog posts for content marketing", category: "marketing", min_stage: "beta", sort_order: 596 },
  { item: "Set up email newsletter", category: "marketing", min_stage: "beta", sort_order: 598 },

  // Launch
  { item: "ProductHunt submission draft", category: "launch", min_stage: "beta", sort_order: 650 },
  { item: "HN Show HN draft", category: "launch", min_stage: "beta", sort_order: 660 },
  { item: "Email list of 50+ warm leads", category: "launch", min_stage: "beta", sort_order: 670 },
  { item: "Reddit / Discord community posts drafted", category: "launch", min_stage: "beta", sort_order: 680 },
  { item: "Influencer outreach list", category: "launch", min_stage: "beta", sort_order: 685 },
  { item: "Press contacts (TechCrunch etc.)", category: "launch", min_stage: "beta", sort_order: 690 },
  { item: "Launch day checklist", category: "launch", min_stage: "beta", sort_order: 695 },

  // Growth
  { item: "Track churn and NPS", category: "growth", min_stage: "live", sort_order: 750 },
  { item: "A/B test pricing", category: "growth", min_stage: "live", sort_order: 760 },
  { item: "Start content marketing pipeline", category: "growth", min_stage: "live", sort_order: 770 },
  { item: "SEO optimization pass", category: "growth", min_stage: "live", sort_order: 780 },
  { item: "Set up referral program", category: "growth", min_stage: "live", sort_order: 790 },
  { item: "Customer interview cadence (weekly)", category: "growth", min_stage: "live", sort_order: 795 },
];

// Additional items specific to open-source projects.
export const CHECKLIST_OPEN_SOURCE: ChecklistItem[] = [
  // Validation
  { item: "Check for existing OSS alternatives", category: "validation", min_stage: "idea", sort_order: 160 },
  { item: "Define licensing strategy (MIT / Apache / GPL)", category: "validation", min_stage: "idea", sort_order: 170 },
  { item: "Identify 10 potential early contributors", category: "validation", min_stage: "idea", sort_order: 180 },

  // Build
  { item: "Write CONTRIBUTING.md", category: "build", min_stage: "idea", sort_order: 270 },
  { item: "Set up issue templates", category: "build", min_stage: "idea", sort_order: 280 },
  { item: "Write CODE_OF_CONDUCT.md", category: "build", min_stage: "idea", sort_order: 290 },
  { item: "Document local dev setup for contributors", category: "build", min_stage: "idea", sort_order: 292 },
  { item: "Add example usage in README", category: "build", min_stage: "idea", sort_order: 294 },

  // Infrastructure
  { item: "Configure GitHub Actions for tests", category: "infra", min_stage: "building", sort_order: 395 },
  { item: "Set up release automation", category: "infra", min_stage: "building", sort_order: 396 },
  { item: "Configure dependabot", category: "infra", min_stage: "building", sort_order: 397 },
  { item: "Set up code coverage reporting", category: "infra", min_stage: "building", sort_order: 398 },
  { item: "Add badges to README (build, coverage, license)", category: "infra", min_stage: "building", sort_order: 399 },

  // Legal
  { item: "Pick an OSS license (MIT / Apache / GPL)", category: "legal", min_stage: "building", sort_order: 410 },
  { item: "Add LICENSE file to repo", category: "legal", min_stage: "building", sort_order: 420 },
  { item: "Trademark check for project name", category: "legal", min_stage: "building", sort_order: 430 },
  { item: "Contributor License Agreement (CLA) decision", category: "legal", min_stage: "building", sort_order: 440 },
  { item: "Copyright notice in source files", category: "legal", min_stage: "building", sort_order: 450 },

  // Marketing
  { item: "Comprehensive README with quickstart", category: "marketing", min_stage: "beta", sort_order: 570 },
  { item: "Documentation site (VitePress / Docusaurus / equivalent)", category: "marketing", min_stage: "beta", sort_order: 580 },
  { item: "API documentation", category: "marketing", min_stage: "beta", sort_order: 590 },
  { item: "Write first blog post about the project", category: "marketing", min_stage: "beta", sort_order: 592 },
  { item: "Create demo / playground site", category: "marketing", min_stage: "beta", sort_order: 594 },

  // Launch
  { item: "HN Show HN draft", category: "launch", min_stage: "beta", sort_order: 650 },
  { item: "Reddit r/programming + language-specific subreddit posts", category: "launch", min_stage: "beta", sort_order: 660 },
  { item: "Tweet thread with demo", category: "launch", min_stage: "beta", sort_order: 670 },
  { item: "Dev.to / Hashnode article", category: "launch", min_stage: "beta", sort_order: 680 },
  { item: "Submit to relevant awesome-* lists", category: "launch", min_stage: "beta", sort_order: 685 },
  { item: "Discord / Slack community announcements", category: "launch", min_stage: "beta", sort_order: 690 },

  // Growth
  { item: "Triage issues weekly", category: "growth", min_stage: "live", sort_order: 750 },
  { item: "Respond to PRs within 48h", category: "growth", min_stage: "live", sort_order: 760 },
  { item: "Grow contributor base (mentor first contributors)", category: "growth", min_stage: "live", sort_order: 770 },
  { item: "Release cadence (weekly / monthly)", category: "growth", min_stage: "live", sort_order: 780 },
  { item: "Maintain changelog", category: "growth", min_stage: "live", sort_order: 790 },
];

export function getDefaultChecklist(projectType: "for-profit" | "open-source"): ChecklistItem[] {
  const typeSpecific = projectType === "open-source" ? CHECKLIST_OPEN_SOURCE : CHECKLIST_FOR_PROFIT;
  return [...CHECKLIST_UNIVERSAL, ...typeSpecific];
}
