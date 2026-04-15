# Compliance Refinement (A3) — Design Spec

**Date:** 2026-04-15
**Scope:** Replace the static `LEGAL_REQUIREMENTS` map with a richer, LLM-augmented compliance system. Items carry priority/category/why/action/resources metadata. LLM personalizes items at country-add time and runs freshness reviews on demand. EU is auto-attached when any EU member country is present. Russia gets first-class extensive coverage.

---

## 1. Goals

- Items are no longer dumb strings — each carries priority, category, "why it matters", concrete action, and curated resource links
- LLM personalizes the `action` text per project at seed time (when a country is added)
- LLM "Review compliance" button surfaces stale, missing, or renamed items as a diff for user approval
- Static curated catalog grounds the LLM (no fake legal items)
- EU stops being a fake "country" — it auto-attaches when any EU member is added
- Russia gets ~12-15 detailed items reflecting the strict 152-ФЗ / Roskomnadzor / data-localization requirements
- Backward compatible — legacy items (null metadata) display with default badges, no migration script needed

---

## 2. Data Model

### 2.1 `legal_items` table — additive migration

```sql
ALTER TABLE legal_items ADD COLUMN priority TEXT;        -- 'blocker' | 'important' | 'recommended'
ALTER TABLE legal_items ADD COLUMN category TEXT;        -- see LegalCategory below
ALTER TABLE legal_items ADD COLUMN why TEXT;             -- 1-2 sentence explanation
ALTER TABLE legal_items ADD COLUMN action TEXT;          -- concrete next step (LLM personalizes per project at seed)
ALTER TABLE legal_items ADD COLUMN resources TEXT;       -- JSON: [{label, url}, ...]
ALTER TABLE legal_items ADD COLUMN scope TEXT NOT NULL DEFAULT 'country';  -- 'country' | 'region'
ALTER TABLE legal_items ADD COLUMN scope_code TEXT;      -- e.g., 'eu' for region items
ALTER TABLE legal_items ADD COLUMN last_reviewed_at INTEGER;
ALTER TABLE legal_items ADD COLUMN status_note TEXT;     -- LLM-generated review comment, null if no concerns
```

Same idempotent `try { db.run(...) } catch {}` pattern as the tech-debt and launch-checklist migrations.

**Backward compat:** Legacy items have null metadata. The UI displays them with default badges (`recommended` / `terms`) and no Why/Action sections. Same trick as the launch checklist's "General" fallback section.

### 2.2 New static catalog file — `server/src/lib/legal-catalog.ts`

```typescript
export type LegalPriority = "blocker" | "important" | "recommended";
export type LegalCategory = "privacy" | "tax" | "terms" | "ip" | "accessibility" | "data" | "corporate";
export type LegalProjectType = "for-profit" | "open-source";

export interface LegalCatalogItem {
  item: string;
  priority: LegalPriority;
  category: LegalCategory;
  why: string;
  action: string;                              // generic baseline; LLM personalizes per project
  resources: { label: string; url: string }[];
  project_types: LegalProjectType[];           // which project types this applies to
  // Exactly one of these two must be set:
  countries?: string[];                        // e.g., ["US", "UK"]
  region?: "eu";                               // e.g., "eu" for EU-wide items
  feature_gated?: "messaging" | "streaming" | "ai" | "fintech";
                                               // Optional: only seed if LLM detects this feature in project description
}

export const EU_MEMBER_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

export const LEGAL_CATALOG: LegalCatalogItem[] = [ /* see Section 6 */ ];

export function itemsForCountry(countryCode: string, projectType: LegalProjectType): LegalCatalogItem[];
export function itemsForRegion(region: "eu", projectType: LegalProjectType): LegalCatalogItem[];
export function isEuMember(countryCode: string): boolean;
```

### 2.3 Client types — `client/src/lib/types.ts`

```typescript
export type LegalPriority = "blocker" | "important" | "recommended";
export type LegalCategory = "privacy" | "tax" | "terms" | "ip" | "accessibility" | "data" | "corporate";

export interface LegalItem {
  id: string;
  project_id: string;
  country_code: string;                        // empty string for region items (EU); UI keys off scope/scope_code instead
  item: string;
  completed: 0 | 1;
  created_at: number;
  // new fields (nullable for legacy backward compat):
  priority: LegalPriority | null;
  category: LegalCategory | null;
  why: string | null;
  action: string | null;
  resources: { label: string; url: string }[];   // empty array if none
  scope: "country" | "region";
  scope_code: string | null;                      // "eu" for region items
  last_reviewed_at: number | null;
  status_note: string | null;
}

export interface LegalReviewDiff {
  ok: string[];                                                    // unchanged item IDs
  stale: { id: string; status_note: string }[];                    // items with concerns
  rename: { id: string; new_item: string }[];                      // canonical name changed
  missing: Omit<LegalItem, "id" | "project_id" | "completed" | "created_at" | "last_reviewed_at" | "status_note">[];
  removed: string[];                                                // item IDs no longer applicable
}
```

---

## 3. Seeding Flow (country-add trigger)

When `POST /api/projects/:id/countries` runs:

1. Insert the `project_countries` row (unchanged from today)
2. Look up catalog items for that country code + project type via `itemsForCountry()`
3. **EU auto-attach:** If `isEuMember(country_code)` and the project has no existing `scope='region' AND scope_code='eu'` rows, queue up `itemsForRegion("eu", projectType)` for seeding too
4. **Feature-gated filter:** For items with `feature_gated`, the LLM at step 5 decides whether to include them based on the project description. If unclear, include them with a `status_note` flagging "review whether this applies"
5. Call the LLM with the project context + queued items. The LLM personalizes only the `action` field. Everything else is copied verbatim from the catalog
6. Insert each `legal_items` row with full metadata + personalized action + `last_reviewed_at = Date.now()`

**LLM contract (seed-time enrichment):**

```
SYSTEM: You personalize compliance action text for a specific project. You DO NOT add, remove, or rename items. You only rewrite the `action` field to be specific to this project's tech stack and description. If the generic action is already specific enough, return it verbatim.

INPUT (JSON):
{
  "project": { "name": "...", "description": "...", "type": "for-profit" | "open-source", "stage": "..." },
  "items": [
    { "key": "<stable identifier>", "item": "...", "why": "...", "generic_action": "...", "feature_gated": null | "messaging" | "streaming" | "..." }
  ]
}

OUTPUT (JSON):
{
  "items": [
    { "key": "<same key>", "personalized_action": "...", "skip_due_to_feature_gate": false }
  ]
}

Rules:
- Never invent items not in the input
- If an input item has `feature_gated` and the project description gives no evidence of that feature, set `skip_due_to_feature_gate: true` (server will still seed but with a status_note)
- Personalize using concrete tech stack details from the description (e.g., "Your stack uses PostHog and Supabase — your privacy policy must list these processors")
- Keep personalized actions under 200 words
```

**Failure handling:**
- LLM call timeout: 5 seconds
- On error or timeout: seed all items with the generic `action` text and `status_note: "Pending enrichment — click Review to refresh"`
- The country-add HTTP request must never block on the LLM — if the LLM is slow, fall back to generic actions

**EU cascade on country removal:** When `DELETE /api/projects/:id/countries/:cId` runs, after removing the country, check whether any other EU member countries remain. If not, also `DELETE FROM legal_items WHERE project_id = ? AND scope = 'region' AND scope_code = 'eu'`.

**EU items country_code:** EU items use `country_code = ''` (empty string, not null) in storage. The UI keys off `scope` and `scope_code` for EU items, ignoring `country_code`. This keeps the existing NOT NULL constraint on `country_code` in the schema.

---

## 4. Review Flow (button-click trigger)

### 4.1 New endpoint: `POST /api/projects/:id/legal/review`

Request body: `{}` (no parameters)

Server:
1. Loads project context (name, description, type, stage)
2. Loads all current `legal_items` for the project (with metadata)
3. Loads the catalog snapshot for all countries the project has + EU if applicable
4. Calls the LLM with the review contract
5. Returns the `LegalReviewDiff` JSON to the client (no DB writes happen here)

**LLM contract (freshness review):**

```
SYSTEM: You audit a project's compliance items against a catalog of canonical requirements. You return a structured diff of what's stale, missing, renamed, or no longer applicable. You are conservative — when in legal uncertainty, mark items as `ok` rather than `stale` or `removed`.

INPUT (JSON):
{
  "project": { "name": "...", "description": "...", "type": "for-profit" | "open-source", "stage": "..." },
  "current_items": [
    { "id": "...", "country_code": "...", "scope": "country" | "region", "item": "...", "priority": "...", "category": "...", "why": "...", "action": "..." }
  ],
  "catalog": [
    { "item": "...", "priority": "...", "category": "...", "why": "...", "action": "...", "resources": [...], "countries": [...] | "region": "eu" }
  ]
}

OUTPUT (JSON):
{
  "ok": ["<id>", ...],
  "stale": [{ "id": "<id>", "status_note": "<concise concern, 1 sentence>" }],
  "rename": [{ "id": "<id>", "new_item": "<new name>" }],
  "missing": [{ "item": "...", "priority": "...", "category": "...", "why": "...", "action": "...", "resources": [...], "country_code": "...", "scope": "country" | "region", "scope_code": null | "eu" }],
  "removed": ["<id>", ...]
}

Rules:
- For `missing`, prefer items from the catalog. Only include LLM-suggested items not in the catalog if you are highly confident
- For `removed`, only include items where you are confident the requirement was repealed or doesn't apply (e.g., wrong project type)
- For `stale`, the `status_note` must be specific (e.g., "EU AI Act Article 50 transparency requirements take effect August 2026 — review action text")
- Default to `ok` when uncertain
```

**Failure handling:**
- LLM call timeout: 15 seconds (deliberate user action, longer budget)
- On error: return HTTP 503 with `{ error: "LLM review unavailable", retryable: true }`
- Modal shows error state with retry button

### 4.2 New endpoint: `POST /api/projects/:id/legal/review/apply`

Request body matches the subset of `LegalReviewDiff` the user accepted in the modal:

```typescript
{
  stale: { id: string; status_note: string }[];
  rename: { id: string; new_item: string }[];
  missing: Omit<LegalItem, "id" | "project_id" | "completed" | "created_at" | "last_reviewed_at" | "status_note">[];
  removed: string[];
}
```

Note: `missing` items use the **resolved** shape (with `country_code`, `scope`, `scope_code` already set by the LLM), not the raw `LegalCatalogItem` shape. The LLM's review output picks which country/scope each missing item should attach to.

Server applies all changes in a single transaction:
- For each `stale`: `UPDATE legal_items SET status_note = ?, last_reviewed_at = ? WHERE id = ? AND project_id = ?`
- For each `rename`: `UPDATE legal_items SET item = ?, last_reviewed_at = ? WHERE id = ? AND project_id = ?`
- For each `missing`: `INSERT INTO legal_items (...)` with `last_reviewed_at = Date.now()` and `status_note = null`
- For each `removed`: `DELETE FROM legal_items WHERE id = ? AND project_id = ?`
- Items in the original review's `ok` list are **not touched** — the client doesn't send them, so `last_reviewed_at` stays at whatever value they had

Returns `{ applied: number }`.

### 4.3 Review modal (client UI)

Click "Review compliance" button on the Legal tab → modal opens, calls the endpoint, shows tabbed diff:

- **Stale (N)** — items with concerns. Each row: item name + amber `status_note`. Checkbox to accept.
- **Renamed (N)** — current name → proposed name. Checkbox to accept.
- **Missing (N)** — suggested new items. Each row: item + priority badge + category badge + truncated why. Checkbox to add.
- **Removed (N)** — items LLM marked obsolete. Checkbox to delete. **Disabled by default** — user must opt in (single "Allow removals" toggle at the top of this tab) before checkboxes become interactive. Prevents accidental deletion of real obligations.
- **OK (N)** — collapsed by default, just a count: "42 items still accurate."

Footer: "Apply N changes" button (where N = total accepted across all tabs). On apply, calls `/legal/review/apply` with the selected changes, closes modal on success, invalidates the legal query.

**No partial applies** — either all selected changes apply (single transaction) or none (rollback on error).

### 4.4 Visual signals outside the modal

- Items with `status_note != null` show a small amber `●` next to their badge row
- Hovering the dot shows a tooltip with the note
- Filter bar gets a "Needs review" status option that filters to items with `status_note`

---

## 5. UI on the Legal tab

### 5.1 Top bar

- **Country selector + Add button** (unchanged signature, but EU is **removed** from the dropdown)
- **"Review compliance" button** on the right — calls the review endpoint, opens the modal
- **Filter bar** below the top row:
  - Priority dropdown: All / Blocker / Important / Recommended
  - Category dropdown: All / Privacy / Tax / Terms / IP / Accessibility / Data / Corporate
  - Status dropdown: All / Open / Done / Needs review

### 5.2 Active scope chips

Country chips as today, **plus** an automatic 🇪🇺 EU chip when any EU member is present. The EU chip is **non-removable directly** (no X button) — it disappears when the last EU member is removed. Tooltip on hover: "Removed automatically when no EU member countries remain."

### 5.3 Per-scope cards

One card per country, plus one card for EU if present. Card header: flag + name + completion count + progress bar (matches today's design).

### 5.4 Item rows (rich layout)

Replaces today's plain checkbox + label:

```
[ ] GDPR Privacy Policy                           🔴 blocker  privacy  ●─needs review  [trash]
    ▾ Why this matters
      Required for any site processing EU user data. Fines up to 4% global revenue.
    ▾ Action
      Your SaaS collects emails and PostHog analytics. Privacy policy must disclose
      data types, retention period, third-party processors (PostHog, Supabase),
      and user rights (access, deletion, portability).
    Resources
      [Termly template ↗]  [GDPR.eu guide ↗]  [Stripe Atlas guide ↗]
```

- Each row uses the spacing pattern from the recently-polished tech debt rows: `p-4`, `gap-3`, `space-y-3`
- **Why** and **Action** sections are collapsible (default collapsed; click chevron to expand)
- **Resources** are clickable badge-style links opening in new tabs
- The amber `●` dot appears only when `status_note != null`
- Trash button appears on hover, same pattern as today

### 5.5 Legacy item rendering

Items with null metadata display with default badges (`recommended` / `terms`) and **no** Why/Action/Resources sections. They're functionally identical to today's items. Backward-compat without forced migration.

### 5.6 Custom item form

Today's "+ Add custom item" form is extended with priority and category dropdowns:

```
[textarea: Custom legal item...]
[Select: Priority (default Recommended)] [Select: Category (default Terms)] [Add]
```

LLM enrichment does **not** run on custom items — they're treated as fully user-managed. `why`, `action`, `resources` remain null until the user edits them in the future (out of scope for V1: the row UI is read-only for these fields).

### 5.7 Disclaimer banner

A persistent, dismissible-per-session disclaimer at the top of the Legal tab:

> ⚠️ **Compliance suggestions, not legal advice.** This list is curated from public sources and personalized by an AI. Consult a lawyer before launching in regulated industries.

---

## 6. Catalog Content (V1)

### 6.1 Scope

- **Regions (1):** EU (GDPR, ePrivacy, DSA, Accessibility Act)
- **Countries (12):** RU (extensive), US, UK, CA, AU, DE, FR, NL, IN, BR, JP, SG
- **Total catalog target:** ~70-85 items
- **Drop:** the generic "global" placeholder; legal items must always be scoped

### 6.2 Russia — first-class extensive coverage (~12-15 items)

| # | Item | Priority | Category | Notes |
|---|---|---|---|---|
| 1 | Privacy Policy compliant with 152-ФЗ (in Russian) | blocker | privacy | Must specify purposes, legal basis, retention, transfer locations |
| 2 | Roskomnadzor personal data operator notification (уведомление оператора ПД) | blocker | data | Submit via pd.rkn.gov.ru before processing personal data |
| 3 | Data localization — store/process Russian users' personal data on servers physically in Russia (ФЗ-242) | blocker | data | Strict enforcement; fines + site blocking risk |
| 4 | Cross-border data transfer notification to RKN | blocker | data | Required before any transfer abroad; receiving country must be on RKN's "adequate" list |
| 5 | Explicit consent flow for personal data processing (separate signable document) | blocker | privacy | Cannot be bundled with ToS acceptance |
| 6 | Separate marketing consent (cannot be bundled with service consent) | important | privacy | Required by 152-ФЗ Article 9 |
| 7 | User Agreement / ToS compliant with Consumer Protection Law (ЗоЗПП) | important | terms | Must allow refunds, disclose business identity |
| 8 | Russian-language interface for consumer-facing services | important | terms | Required by Federal Law on State Language |
| 9 | Personal data breach notification protocol (24h to RKN, 72h to users) | important | data | New requirement effective 2022 |
| 10 | DPO appointment (if processor role or systematic monitoring) | recommended | corporate | Article 22.1 152-ФЗ |
| 11 | ОРИ (Organizer of Information Dissemination) registration | important | data | feature_gated: "messaging" |
| 12 | Yarovaya law data retention (6mo content, 1yr metadata) | important | data | feature_gated: "messaging" |
| 13 | VAT registration for foreign digital service sellers (244-ФЗ) | important | tax | If selling digital services to RU consumers from abroad |
| 14 | Tax entity registration: ИП / Самозанятый / ООО depending on revenue scale | blocker | tax | Required to legally accept payments |
| 15 | Children's data special handling (под 18) | recommended | privacy | Articles 9.4 and 14 152-ФЗ |

**RU resources (curated, vetted):**

- pd.rkn.gov.ru — RKN operator register portal (authoritative)
- rkn.gov.ru — official guidance pages
- consultant.ru and garant.ru — full text of 152-ФЗ, ФЗ-242, ЗоЗПП
- pravo.gov.ru — official legal portal
- nalog.gov.ru — Federal Tax Service (IP/ООО/Самозанятый registration)

Each RU catalog item gets 2-4 of these links in its `resources` array, picked for direct relevance.

### 6.3 EU items (~6-8)

GDPR Privacy Policy, Cookie Consent Banner with explicit opt-in, DPA with sub-processors, Records of Processing Activities (ROPA), Right-to-deletion / data subject request flow, Personal Data Breach Notification (72h to DPA), ePrivacy / Cookie Law compliance, EU Accessibility Act (where applicable).

### 6.4 US (~5-7)

Terms of Service, Privacy Policy with CCPA disclosures, DMCA Policy, ADA Accessibility Statement, CAN-SPAM compliance for marketing email, state-specific add-ons noted in `why` (e.g., "Virginia VCDPA, Colorado CPA, Connecticut CTDPA also apply if you serve users in those states").

### 6.5 UK (~4-6)

UK GDPR Privacy Policy, ICO registration if processing personal data, Cookie Policy (PECR), Data Retention Policy, Age-Appropriate Design Code if any users under 18.

### 6.6 DE / FR / NL country-specific extras (~3-4 each)

On top of the EU items they auto-receive:
- **DE:** Impressum (legally required imprint), DSGVO-specific privacy clauses, BfDI consultation if needed
- **FR:** CNIL declaration, French language requirement (Toubon Law)
- **NL:** AP (Autoriteit Persoonsgegevens) registration, Dutch language for consumer terms

### 6.7 Other countries (~3-5 each)

CA (PIPEDA), AU (Privacy Act 1988, Australian Consumer Law), IN (DPDP Act, IT Act), BR (LGPD, ANPD), JP (APPI), SG (PDPA).

### 6.8 Project-type filtering

Open-source projects get a dramatically smaller catalog:
- Universal: pick OSS license (MIT/Apache/GPL), add LICENSE file, copyright headers, trademark check, contributor agreement decision
- US-specific: DMCA designated agent (if accepting community contributions of code)
- EU-specific: minimal — basically attribution requirements

A typical open-source project picking US + EU sees ~5-10 items total. For-profit picking the same sees ~25-30.

---

## 7. API Surface

### 7.1 Modified existing endpoints

- `POST /api/projects/:id/countries` — same signature; server-side seeding now runs LLM enrichment and EU auto-attach. Returns the country row as today.
- `GET /api/projects/:id/legal` — same shape, but rows include the new metadata fields. Frontend type updated.
- `POST /api/projects/:id/legal` — extended to accept `priority`, `category`, `why`, `action`, `resources`. All optional; defaults to `recommended` / `terms` / null / null / `[]`.
- `PUT /api/projects/:id/legal/:itemId` — becomes a dynamic SET-builder (same pattern as tech debt's PUT) accepting any subset of `completed`, `item`, `priority`, `category`, `why`, `action`, `resources`, `status_note`.
- `DELETE /api/projects/:id/countries/:cId` — additionally cascades EU items if removing this country leaves zero EU members.

### 7.2 New endpoints

- `POST /api/projects/:id/legal/review` — runs LLM review, returns `LegalReviewDiff`. No DB writes.
- `POST /api/projects/:id/legal/review/apply` — applies a diff in one transaction, returns `{ applied: number }`.

### 7.3 LLM client wrapper

New file `server/src/lib/legal-llm.ts` exporting:

```typescript
export async function enrichSeedItems(
  project: { name: string; description: string | null; type: string; stage: string },
  items: LegalCatalogItem[]
): Promise<{ key: string; personalized_action: string; skip_due_to_feature_gate: boolean }[]>;

export async function reviewItems(
  project: { name: string; description: string | null; type: string; stage: string },
  currentItems: LegalItem[],
  catalog: LegalCatalogItem[]
): Promise<LegalReviewDiff>;
```

Both functions wrap the existing `server/src/lib/llm.ts` helper that powers news summaries (using `LLM_URL` and `LLM_MODEL` env vars). Each parses JSON or throws. Each enforces a per-call timeout (5s for enrichment, 15s for review).

---

## 8. Migration Strategy

- **Existing projects:** Their current legal items remain with null metadata. They display under their existing country cards with default badges. Adding a new country triggers the new flow; old items are unaffected.
- **EU cleanup for existing projects:** Projects that previously added "EU" as a country still have it as a country entry. A one-time idempotent server-startup migration:
  1. For each project that has `country_code = 'EU'` in `project_countries`:
  2. Convert the existing EU items to `scope = 'region'`, `scope_code = 'eu'`
  3. Delete the `project_countries` row for EU
  4. If the project has zero EU member countries (DE/FR/etc.), the EU items become orphaned — keep them displayed (they're real legal items the user added intentionally) but mark them with a `status_note: "EU items present without an EU member country selected. Add a member country or delete these items if no longer relevant."`
- **No data loss, no forced migration, smooth rollout.**

---

## 9. Out of Scope (V1)

- **Editing custom item metadata in the UI** — custom items can have priority/category set at creation, but editing why/action/resources later is not supported in V1. Add later if needed.
- **Per-state US compliance** (Virginia, Colorado, etc.) — covered in `why` text only, not as separate catalog items
- **Compliance for sanctioned jurisdictions** beyond what RU coverage provides
- **Multi-language item content** — UI is English; RU items are described in English with the law name in Russian. RU item action text may include Russian terms inline where helpful.
- **Automated scheduled review (cron)** — V1 is button-only. A weekly cron is a future enhancement.
- **Compliance scoring / dashboard rollup** — currently only the existing per-card progress bar. No project-wide compliance score in V1.
- **Document generation** — we link to Termly etc., we don't generate Privacy Policies ourselves
- **Webhook/email alerts when items become stale** — V1 surfaces stale state only inside the app

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| LLM hallucinates fake legal requirements | Constrained contracts: enrichment can only rewrite `action`, review prefers items from the catalog, conservative defaults toward `ok` |
| LLM seed-time enrichment makes country-add slow | 5s timeout + fallback to generic action text; HTTP request never blocks |
| User accepts a bad LLM "removed" suggestion and loses a real obligation | Removals are opt-in (toggle gate in modal), conservative LLM prompt |
| RU compliance items become outdated due to law changes | Review button + curated catalog updates; we ship updates by editing the static file |
| Resource links rot | Static curated list, easy to update; future enhancement could add a link-checker cron |
| Legacy items look broken next to new rich items | Default badges + identical interaction model; no forced migration |
| Cost of LLM calls scales with country-add frequency | Each enrichment is one call processing N items; review is one call total. Cost is bounded and predictable. |
