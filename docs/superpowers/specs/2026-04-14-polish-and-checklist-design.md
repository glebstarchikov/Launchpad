# Polish Fixes + Launch Checklist Refinement — Design Spec

**Date:** 2026-04-14
**Scope:** Two bundled improvements. **A1** is a set of polish/bug fixes (number color standardization, URL overflow on Health tab, tech debt UI enhancement). **A2** is a complete rework of the launch checklist system — 7 categories, stage-aware, project-type-aware, fully customizable.

---

## Part A1 — Polish Fixes

### A1.1 Dashboard Number Color Standardization

**Problem:** Number colors on the Dashboard are inconsistent. Ideas Inbox shows yellow even when zero, implying a warning state that doesn't exist.

**Rule:** Colors convey **state**, not category.

| Metric | Zero value | Non-zero value |
|--------|-----------|----------------|
| Total MRR | `text-foreground` (white) | `text-success` (green) |
| Projects | `text-foreground` (white) | `text-foreground` (white) |
| Idea Inbox | `text-foreground` (white) | `text-foreground` (white) |
| Legal Pending | `text-foreground` (white) | `text-destructive` (red) |

**Implementation:** Update conditionals in `client/src/pages/Dashboard.tsx` for Ideas Inbox card. Remove `text-warning` class. Apply the same zero/non-zero rule already used by MRR and Legal Pending.

### A1.2 Site Status URL Overflow (Health tab)

**Problem:** In ProjectDetail → Health tab, the site status card shows the project URL. Long URLs overflow and push the "Ping Now" button off-screen or out of the card.

**Fix:**
- Wrap the URL in a flex container with `min-w-0` so it shrinks below its intrinsic width
- Apply `truncate` class so it ellipsizes
- Button stays fixed-width (`shrink-0`) on the right
- Clicking the URL still opens in a new tab

**Implementation:** Modify the Health tab's site status card in `client/src/pages/ProjectDetail.tsx`.

### A1.3 Tech Debt UI Enhancement

**Problem:** Tech debt is currently a plain textarea list. No priority, no category, no effort estimate.

**New data model:** Add three columns to `tech_debt` table:
- `severity TEXT` — enum: `low` | `medium` | `high` (nullable, default `medium`)
- `category TEXT` — enum: `bug` | `refactor` | `security` | `performance` | `docs` (nullable, default `refactor`)
- `effort TEXT` — enum: `quick` | `moderate` | `significant` (nullable, default `moderate`)

**UI:**
- Creation form: textarea + three dropdowns (severity/category/effort)
- List item: card with description + badges for severity (colored), category (muted), effort (muted)
- Filter bar at top: filter by severity, category, effort, resolved state
- Severity badges: `low`=muted, `medium`=warning, `high`=destructive

**Backward compatibility:** Existing tech debt items have null values for the new columns. UI displays them with default badges ("medium / refactor / moderate").

---

## Part A2 — Launch Checklist Refinement

### Goals
- Replace the flat 15-item default with a **7-category, stage-aware, type-specific** system
- Let founders fully customize: add, edit, delete any item
- Visually guide focus to stage-relevant items without hiding future work
- Draw from real-world sources: ProductHunt launch playbook, YC Startup School, Stripe Atlas, Indie Hackers community wisdom, standard SaaS launch practices

### Categories (7)

| # | Slug | Display Name | min_stage |
|---|------|-------------|-----------|
| 1 | `validation` | Validation & Research | idea |
| 2 | `build` | Build & MVP | idea |
| 3 | `infra` | Technical Infrastructure | building |
| 4 | `legal` | Legal & Admin | building |
| 5 | `marketing` | Marketing & Content | beta |
| 6 | `launch` | Launch Prep | beta |
| 7 | `growth` | Post-launch Growth | live |

### Data Model Changes

Add nullable columns to `launch_checklist` table:
```sql
ALTER TABLE launch_checklist ADD COLUMN category TEXT;
ALTER TABLE launch_checklist ADD COLUMN min_stage TEXT;
ALTER TABLE launch_checklist ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
```

**Backward compatibility:** Existing items have null `category` and `min_stage`. They're displayed under a "General" fallback section and always treated as "relevant" (not muted).

### Default Checklist Content

Items are split into **universal** (same for both types), **for-profit only**, and **open-source only**. Total counts:
- **For-profit project:** ~65 items
- **Open-source project:** ~55 items

Full lists below.

---

#### Category 1 — Validation & Research (min_stage: idea)

**Universal (6):**
1. Define target customer persona
2. Research 3+ direct competitors
3. Talk to 5+ potential users
4. Validate the problem is real (evidence, not hypothesis)
5. Define primary success metric
6. Write a one-sentence value proposition

**For-profit only (3):**
1. Research willingness to pay (surveys, interviews)
2. Draft pricing strategy (tiers, anchor price)
3. Identify first 10 target customers (by name)

**Open-source only (3):**
1. Check for existing OSS alternatives
2. Define licensing strategy (MIT / Apache / GPL / etc.)
3. Identify 10 potential early contributors

---

#### Category 2 — Build & MVP (min_stage: idea)

**Universal (7):**
1. Define MVP scope (single paragraph)
2. Create git repository
3. Document local dev environment setup
4. Build core feature #1 (the one thing)
5. Write basic README
6. Set up version control branching strategy
7. Document tech stack decisions

**For-profit only (5):**
1. Set up user authentication
2. Define data model for users
3. Plan billing / subscription flow
4. Build customer dashboard
5. Build admin dashboard

**Open-source only (5):**
1. Write CONTRIBUTING.md
2. Set up issue templates
3. Write CODE_OF_CONDUCT.md
4. Document local dev setup for contributors
5. Add example usage in README

---

#### Category 3 — Technical Infrastructure (min_stage: building)

**Universal (10):**
1. Set up CI/CD pipeline
2. Configure custom domain
3. Install SSL certificate
4. Set up uptime monitoring
5. Set up error tracking (Sentry or equivalent)
6. Set up analytics (Plausible / PostHog / etc.)
7. Configure automated backups
8. Set up staging environment
9. Performance baseline (Core Web Vitals)
10. Mobile responsiveness check

**For-profit only (6):**
1. Set up transactional email service
2. Set up customer support inbox
3. Configure payment processing
4. Set up webhook handling
5. Define rate limiting
6. Set up secrets management

**Open-source only (5):**
1. Configure GitHub Actions for tests
2. Set up release automation
3. Configure dependabot
4. Set up code coverage reporting
5. Add badges to README (build, coverage, license)

---

#### Category 4 — Legal & Admin (min_stage: building)

**Universal (1):**
1. Choose business / entity type (or "none yet")

**For-profit only (9):**
1. Draft Terms of Service
2. Draft Privacy Policy
3. Register business entity
4. Set up business bank account
5. Tax registration (as required)
6. Cookie consent banner (if EU users)
7. GDPR compliance basics (if EU users)
8. Accounting / invoicing setup
9. Refund & cancellation policy

**Open-source only (5):**
1. Pick an OSS license (MIT / Apache / GPL)
2. Add LICENSE file to repo
3. Trademark check for project name
4. Contributor License Agreement (CLA) decision
5. Copyright notice in source files

---

#### Category 5 — Marketing & Content (min_stage: beta)

**Universal (7):**
1. Landing page with clear value proposition
2. Hero section with demo video or screenshots
3. "About" page
4. Set up Twitter / X account
5. Set up LinkedIn page
6. SEO basics (meta tags, sitemap, robots.txt)
7. Write launch blog post (problem → solution → journey)

**For-profit only (7):**
1. Pricing page with clear tiers
2. FAQ page
3. Case studies / testimonials section
4. Customer logos section
5. Email capture on landing page
6. Write first 5 blog posts for content marketing
7. Set up email newsletter

**Open-source only (5):**
1. Comprehensive README with quickstart
2. Documentation site (VitePress / Docusaurus / equivalent)
3. API documentation
4. Write first blog post about the project
5. Create demo / playground site

---

#### Category 6 — Launch Prep (min_stage: beta)

**Universal (5):**
1. Beta test with 10+ users
2. Fix all critical bugs
3. Write launch announcement post
4. Prepare press kit (logo, screenshots, one-liner, bio)
5. Decide on launch date

**For-profit only (7):**
1. ProductHunt submission draft
2. HN Show HN draft
3. Email list of 50+ warm leads
4. Reddit / Discord community posts drafted
5. Influencer outreach list
6. Press contacts (TechCrunch etc.)
7. Launch day checklist

**Open-source only (6):**
1. HN Show HN draft
2. Reddit r/programming + language-specific subreddit posts
3. Tweet thread with demo
4. Dev.to / Hashnode article
5. Submit to relevant awesome-* lists
6. Discord / Slack community announcements

---

#### Category 7 — Post-launch Growth (min_stage: live)

**Universal (5):**
1. Monitor analytics daily for first week
2. Respond to all feedback within 24h
3. Create feedback loop (email, form, or Discord)
4. Iterate based on usage data
5. Document lessons learned

**For-profit only (6):**
1. Track churn and NPS
2. A/B test pricing
3. Start content marketing pipeline
4. SEO optimization pass
5. Set up referral program
6. Customer interview cadence (weekly)

**Open-source only (5):**
1. Triage issues weekly
2. Respond to PRs within 48h
3. Grow contributor base (mentor first contributors)
4. Release cadence (weekly / monthly)
5. Maintain changelog

---

### Seeding Logic

Update `server/src/lib/constants.ts`:

```typescript
export type ChecklistItem = {
  item: string;
  category: string;
  min_stage: string;
  sort_order: number;
};

export const CHECKLIST_UNIVERSAL: ChecklistItem[] = [
  // 6 validation items, 7 build items, 10 infra items, 1 legal item,
  // 7 marketing items, 5 launch items, 5 growth items = 41 total
  { item: "Define target customer persona", category: "validation", min_stage: "idea", sort_order: 1 },
  // ... etc
];

export const CHECKLIST_FOR_PROFIT: ChecklistItem[] = [
  // 3 + 5 + 6 + 9 + 7 + 7 + 6 = 43 total
  { item: "Research willingness to pay", category: "validation", min_stage: "idea", sort_order: 7 },
  // ... etc
];

export const CHECKLIST_OPEN_SOURCE: ChecklistItem[] = [
  // 3 + 5 + 5 + 5 + 5 + 6 + 5 = 34 total
  { item: "Check for existing OSS alternatives", category: "validation", min_stage: "idea", sort_order: 7 },
  // ... etc
];
```

When a project is created, the server seeds the checklist by combining `CHECKLIST_UNIVERSAL` with the type-specific list based on `project.type`.

Update `server/src/routes/projects.ts` create-project handler and `server/src/routes/ideas.ts` promote-idea handler (both currently use `DEFAULT_CHECKLIST`).

### UI — Overview Tab Rework

**File:** `client/src/pages/ProjectDetail.tsx` (OverviewTab section)

**Layout:**
- 7 collapsible category sections in stage order
- Each section header shows: category name + completion count (e.g. "Validation & Research — 4/9")
- Items sorted by `sort_order` within category
- Each item row: checkbox + title + hover-reveal edit/delete buttons
- Items where `min_stage` is "later" than current project stage: `opacity-50`, slightly muted color
- "+ Add item" button at the bottom of each category
- "General" fallback section at the top for legacy items with null category

**Stage comparison helper:**
```typescript
const STAGE_ORDER: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];
function isStageRelevant(itemMinStage: string | null, projectStage: ProjectStage): boolean {
  if (!itemMinStage) return true; // legacy items always relevant
  const itemIndex = STAGE_ORDER.indexOf(itemMinStage as ProjectStage);
  const projectIndex = STAGE_ORDER.indexOf(projectStage);
  return itemIndex <= projectIndex;
}
```

### API Changes

Existing endpoints work as-is, but the `create` endpoint now accepts optional `category`, `min_stage`, and `sort_order`:

```typescript
// client/src/lib/api.ts
checklist: {
  create: (id: string, item: string, category?: string, min_stage?: string) =>
    req<LaunchChecklistItem>(`/projects/${id}/launch-checklist`, {
      method: "POST",
      body: JSON.stringify({ item, category, min_stage }),
    }),
  update: (id: string, itemId: string, data: { completed?: boolean; item?: string; category?: string; min_stage?: string }) =>
    req<{ ok: true }>(`/projects/${id}/launch-checklist/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  // ... list, delete unchanged
}
```

The `update` endpoint is extended to support editing the item text, category, and min_stage (for custom additions), not just the completed state.

Update `LaunchChecklistItem` type in `client/src/lib/types.ts`:

```typescript
export interface LaunchChecklistItem {
  id: string;
  project_id: string;
  item: string;
  completed: 0 | 1;
  category: string | null;
  min_stage: string | null;
  sort_order: number;
  created_at: number;
}
```

---

## Migration Strategy

- Existing projects: their current 15 checklist items stay as-is with null `category` and `min_stage`. They display under a "General" section at the top of the checklist.
- New projects: seeded with the full new checklist (universal + type-specific).
- No data loss, no forced migration, smooth rollout.

---

## Out of Scope (for this spec)

- A3 — Compliance refinement (next brainstorm)
- A4 — Dashboard metrics expansion (next brainstorm)
- A5 — Daily summary + news workflow standardization
- A6 — Claude Code plugin
- Multi-tenant org mode
