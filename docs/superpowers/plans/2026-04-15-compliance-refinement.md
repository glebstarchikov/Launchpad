# Compliance Refinement (A3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `LEGAL_REQUIREMENTS` map with a richer, LLM-augmented compliance system. Items carry priority/category/why/action/resources metadata. LLM personalizes items at country-add time and runs freshness reviews on demand. EU auto-attaches when any EU member is present. Russia gets first-class extensive coverage.

**Architecture:** Static curated catalog (`server/src/lib/legal-catalog.ts`) grounds the LLM. New `server/src/lib/legal-llm.ts` wraps the existing `generateText` helper with two functions: `enrichSeedItems` (fast, country-add path) and `reviewItems` (slower, button-triggered diff). New endpoints `POST /legal/review` and `POST /legal/review/apply` handle the diff flow. Client gets a filter bar, rich rows with collapsible Why/Action/Resources, an auto-attached 🇪🇺 EU chip, and a Review Compliance modal.

**Tech Stack:** Bun, Hono, bun:sqlite, React 18, TanStack Query v5, Tailwind, shadcn/ui, lucide-react.

---

## File Structure

| Action | File | Purpose |
|---|---|---|
| Create | `server/src/lib/legal-catalog.ts` | Static catalog: types, EU member list, helpers, full item data |
| Create | `server/src/lib/legal-llm.ts` | LLM wrappers: `enrichSeedItems`, `reviewItems` |
| Modify | `server/src/db/index.ts` | 9 idempotent ALTER TABLE migrations on `legal_items` |
| Modify | `server/src/routes/projects.ts` | Replace static `LEGAL_REQUIREMENTS` seeding with catalog + LLM enrichment + EU auto-attach + new review endpoints + EU cascade on DELETE |
| Modify | `server/src/index.ts` | One-time EU cleanup startup migration |
| Modify | `client/src/lib/types.ts` | Extend `LegalItem`, add `LegalPriority`/`LegalCategory`/`LegalReviewDiff` |
| Modify | `client/src/lib/api.ts` | Extend `legal` namespace; add `legal.review` + `legal.applyReview` methods |
| Modify | `client/src/lib/countries.ts` | Remove EU from selector dropdown (keep flag helper) |
| Modify | `client/src/pages/ProjectDetail.tsx` | Filter bar, rich item rows, EU auto-chip, review modal, disclaimer banner, custom item form upgrade |

**Decomposition rationale:** Server logic stays in `routes/projects.ts` (consistent with current organization — that file already owns the legal endpoints). The catalog and LLM wrappers are split out because they're large and have one clear responsibility each. The client UI rework lives in `ProjectDetail.tsx` (matching where today's `LegalTab` lives) — splitting it into separate files would break the established convention used by all other tabs.

---

## Task 1: DB Migration — Add Metadata Columns to `legal_items`

**Files:**
- Modify: `server/src/db/index.ts:32-36`

- [ ] **Step 1: Add the 9 ALTER TABLE statements**

Open `server/src/db/index.ts`. Find the existing block of idempotent `ALTER TABLE` statements (currently lines 32-36, immediately after the `CREATE TABLE projects` block):

```typescript
try { db.run(`ALTER TABLE projects ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.run(`ALTER TABLE projects ADD COLUMN github_repo TEXT`); } catch {}
try { db.run(`ALTER TABLE tech_debt ADD COLUMN severity TEXT`); } catch {}
try { db.run(`ALTER TABLE tech_debt ADD COLUMN category TEXT`); } catch {}
try { db.run(`ALTER TABLE tech_debt ADD COLUMN effort TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN category TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN min_stage TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch {}
```

Append the 9 new `legal_items` migrations after the launch_checklist block:

```typescript
try { db.run(`ALTER TABLE legal_items ADD COLUMN priority TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN category TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN why TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN action TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN resources TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN scope TEXT NOT NULL DEFAULT 'country'`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN scope_code TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN last_reviewed_at INTEGER`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN status_note TEXT`); } catch {}
```

Note: SQLite ignores the `NOT NULL DEFAULT 'country'` for existing rows; new rows will get `'country'` if not specified. Existing legacy items end up with `scope = 'country'` which matches their semantics.

- [ ] **Step 2: Verify the migration ran**

```bash
cd /Users/glebstarcikov/Launchpad && bun -e "import { db } from './server/src/db/index.ts'; console.log(db.query('PRAGMA table_info(legal_items)').all());"
```

Expected: 14 columns total (the original 6 + 9 new + the existing `country_code` etc.). All 9 new columns present (`priority`, `category`, `why`, `action`, `resources`, `scope`, `scope_code`, `last_reviewed_at`, `status_note`).

- [ ] **Step 3: Commit**

```bash
git add server/src/db/index.ts
git commit -m "feat(db): add metadata columns to legal_items"
```

---

## Task 2: Catalog Scaffolding — Types, Helpers, EU Member List

**Files:**
- Create: `server/src/lib/legal-catalog.ts`

- [ ] **Step 1: Create the file with types, helpers, and an empty catalog**

```typescript
// Static catalog of compliance items. Each item ships with full metadata.
// LLM at seed-time only personalizes the `action` field — never adds, removes, or renames items.

export type LegalPriority = "blocker" | "important" | "recommended";
export type LegalCategory = "privacy" | "tax" | "terms" | "ip" | "accessibility" | "data" | "corporate";
export type LegalProjectType = "for-profit" | "open-source";
export type LegalFeatureGate = "messaging" | "streaming" | "ai" | "fintech";

export interface LegalCatalogItem {
  /** Stable identifier used by the LLM to round-trip items without renaming them. */
  key: string;
  /** Human-readable item name shown in the UI. */
  item: string;
  priority: LegalPriority;
  category: LegalCategory;
  /** 1-2 sentence explanation of why the item exists. */
  why: string;
  /** Generic action text. The LLM may personalize this per project at seed time. */
  action: string;
  /** Curated resource links. Always static — never LLM-generated. */
  resources: { label: string; url: string }[];
  project_types: LegalProjectType[];
  /** Optional: only seed if the LLM detects this feature in the project description. */
  feature_gated?: LegalFeatureGate;
  /** Exactly one of `countries` or `region` must be set. */
  countries?: string[];
  region?: "eu";
}

export const EU_MEMBER_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

/**
 * Items will be added in subsequent tasks (3-5).
 * The empty array is exported so other modules can import it now without breaking.
 */
export const LEGAL_CATALOG: LegalCatalogItem[] = [];

export function isEuMember(countryCode: string): boolean {
  return EU_MEMBER_CODES.includes(countryCode);
}

export function itemsForCountry(
  countryCode: string,
  projectType: LegalProjectType
): LegalCatalogItem[] {
  return LEGAL_CATALOG.filter(
    (it) =>
      it.countries?.includes(countryCode) &&
      it.project_types.includes(projectType)
  );
}

export function itemsForRegion(
  region: "eu",
  projectType: LegalProjectType
): LegalCatalogItem[] {
  return LEGAL_CATALOG.filter(
    (it) => it.region === region && it.project_types.includes(projectType)
  );
}
```

- [ ] **Step 2: Verify the file imports cleanly**

```bash
bun -e "import { isEuMember, itemsForCountry } from './server/src/lib/legal-catalog.ts'; console.log(isEuMember('DE'), itemsForCountry('US', 'for-profit').length);"
```

Expected output: `true 0` (true because DE is EU; 0 because the catalog is still empty).

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/legal-catalog.ts
git commit -m "feat(legal): catalog scaffolding with types and helpers"
```

---

## Task 3: Catalog Content — EU + UK + US Items

**Files:**
- Modify: `server/src/lib/legal-catalog.ts` (replace the empty `LEGAL_CATALOG` array)

- [ ] **Step 1: Replace `LEGAL_CATALOG` with the EU/UK/US items**

Replace the line `export const LEGAL_CATALOG: LegalCatalogItem[] = [];` with:

```typescript
export const LEGAL_CATALOG: LegalCatalogItem[] = [
  // ============================================================
  // EU (region) — applies whenever any EU member country is added
  // ============================================================
  {
    key: "eu-gdpr-privacy-policy",
    item: "GDPR-compliant Privacy Policy",
    priority: "blocker",
    category: "privacy",
    why: "Required by GDPR Article 13 for any service processing EU residents' personal data. Non-compliance fines reach 4% of global annual revenue or €20M, whichever is higher.",
    action: "Publish a Privacy Policy at /privacy disclosing: data categories collected, processing purposes, lawful basis, retention periods, third-party processors, user rights (access, rectification, erasure, portability, objection), and DPO contact (if applicable).",
    resources: [
      { label: "GDPR.eu Privacy Notice Template", url: "https://gdpr.eu/privacy-notice/" },
      { label: "EDPB Guidelines on Transparency", url: "https://edpb.europa.eu/our-work-tools/general-guidance/guidelines-recommendations-best-practices_en" },
      { label: "Termly GDPR template", url: "https://termly.io/products/privacy-policy-generator/" },
    ],
    project_types: ["for-profit"],
    region: "eu",
  },
  {
    key: "eu-cookie-consent",
    item: "Cookie Consent Banner with explicit opt-in",
    priority: "blocker",
    category: "privacy",
    why: "ePrivacy Directive + GDPR require explicit, informed, freely given consent before setting non-essential cookies. Pre-ticked boxes and 'continue browsing' notices are not compliant.",
    action: "Implement a consent banner with separate accept/reject buttons (no pre-ticked categories), category-level granularity (necessary / analytics / marketing), and a way to withdraw consent later. Block non-essential trackers until consent is given.",
    resources: [
      { label: "EDPB Guidelines 03/2022 on Dark Patterns", url: "https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-032022-deceptive-design-patterns-social-media_en" },
      { label: "Cookiebot guide", url: "https://www.cookiebot.com/en/gdpr-cookies/" },
    ],
    project_types: ["for-profit"],
    region: "eu",
  },
  {
    key: "eu-dpa-processors",
    item: "Data Processing Agreement (DPA) with each sub-processor",
    priority: "important",
    category: "data",
    why: "GDPR Article 28 requires a written contract with every processor handling personal data on your behalf (cloud hosts, analytics, email, CRM, etc.). Without it, you're personally liable for their breaches.",
    action: "Sign DPAs with every third-party processor (AWS, Vercel, Stripe, PostHog, SendGrid, etc.). Most providers have a self-serve DPA in their dashboard. Keep copies in a /legal folder.",
    resources: [
      { label: "GDPR.eu DPA Template", url: "https://gdpr.eu/data-processing-agreement/" },
      { label: "Stripe DPA", url: "https://stripe.com/legal/dpa" },
    ],
    project_types: ["for-profit"],
    region: "eu",
  },
  {
    key: "eu-ropa",
    item: "Records of Processing Activities (ROPA)",
    priority: "important",
    category: "data",
    why: "GDPR Article 30 requires every controller (even small businesses processing personal data regularly) to maintain a written record of processing activities. Must be available to data protection authorities on request.",
    action: "Maintain a ROPA document covering: processing purposes, data categories, recipients, retention periods, security measures, international transfers. Spreadsheet is fine — no need for fancy software.",
    resources: [
      { label: "ICO ROPA template (UK GDPR but compatible)", url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/documentation/" },
      { label: "EDPB Article 30 guidance", url: "https://edpb.europa.eu/" },
    ],
    project_types: ["for-profit"],
    region: "eu",
  },
  {
    key: "eu-data-subject-requests",
    item: "Data Subject Request flow (access, deletion, portability)",
    priority: "important",
    category: "privacy",
    why: "GDPR gives users the right to access, correct, delete, and export their personal data. You have 30 days to respond. Without a documented flow, you'll miss deadlines.",
    action: "Provide a way for users to request data export, deletion, and corrections — either via a self-serve UI or a documented email process (e.g., privacy@yourdomain.com). Document internal handling steps.",
    resources: [
      { label: "ICO Right of Access guide", url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/" },
    ],
    project_types: ["for-profit"],
    region: "eu",
  },
  {
    key: "eu-breach-72h",
    item: "Personal Data Breach Notification protocol (72h to DPA)",
    priority: "important",
    category: "data",
    why: "GDPR Article 33 requires controllers to notify the supervisory authority within 72 hours of becoming aware of a personal data breach (unless unlikely to result in risk). High-risk breaches also require notifying affected users.",
    action: "Document an incident response runbook: who detects, who decides if it's notifiable, who files the report. Maintain an internal breach log even for non-notifiable incidents.",
    resources: [
      { label: "EDPB Guidelines 9/2022 on data breach notification", url: "https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-92022-personal-data-breach-notification-under_en" },
    ],
    project_types: ["for-profit"],
    region: "eu",
  },
  {
    key: "eu-accessibility-act",
    item: "European Accessibility Act compliance (effective June 28, 2025)",
    priority: "recommended",
    category: "accessibility",
    why: "EAA requires e-commerce, banking, transport, and certain SaaS services to meet WCAG 2.1 AA accessibility standards. Phased enforcement starting June 2025 with country-specific implementation.",
    action: "Audit your UI against WCAG 2.1 AA: keyboard navigation, screen reader labels, color contrast (min 4.5:1), focus indicators, alt text, semantic HTML. Prioritize the top user-flow pages.",
    resources: [
      { label: "WebAIM WCAG 2 checklist", url: "https://webaim.org/standards/wcag/checklist" },
      { label: "EAA overview", url: "https://employment-social-affairs.ec.europa.eu/policies-and-activities/social-protection-social-inclusion/persons-disabilities/union-equality-strategy-rights-persons-disabilities-2021-2030/european-accessibility-act_en" },
    ],
    project_types: ["for-profit"],
    region: "eu",
  },

  // ============================================================
  // UK (country)
  // ============================================================
  {
    key: "uk-gdpr-privacy-policy",
    item: "UK GDPR Privacy Policy",
    priority: "blocker",
    category: "privacy",
    why: "Post-Brexit UK GDPR mirrors EU GDPR with minor variations. Required for any service processing UK residents' personal data.",
    action: "Publish a UK GDPR Privacy Policy at /privacy. Can be the same as your EU policy with a UK section noting ICO as the supervisory authority. Disclose the same information categories as GDPR Article 13.",
    resources: [
      { label: "ICO Make Your Own Privacy Notice", url: "https://ico.org.uk/for-organisations/sme-web-hub/checklists/make-your-own-privacy-notice/" },
      { label: "ICO UK GDPR guidance", url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/" },
    ],
    project_types: ["for-profit"],
    countries: ["UK"],
  },
  {
    key: "uk-ico-registration",
    item: "ICO data protection fee registration",
    priority: "blocker",
    category: "data",
    why: "Most UK organizations processing personal data must pay an annual data protection fee to the ICO (£40-£2,900 depending on size). Failure to register is a criminal offense for the data controller.",
    action: "Register and pay the data protection fee at ico.org.uk/registration. Free tier exists for very small charities and some specific exemptions. Renew annually.",
    resources: [
      { label: "ICO Data Protection Fee", url: "https://ico.org.uk/for-organisations/data-protection-fee/" },
      { label: "Self-assessment tool", url: "https://ico.org.uk/for-organisations/data-protection-fee/self-assessment/" },
    ],
    project_types: ["for-profit"],
    countries: ["UK"],
  },
  {
    key: "uk-pecr-cookies",
    item: "Cookie Policy compliant with PECR",
    priority: "important",
    category: "privacy",
    why: "Privacy and Electronic Communications Regulations require explicit consent before setting non-essential cookies — same standard as EU ePrivacy.",
    action: "Implement a cookie consent banner with explicit opt-in (no pre-ticked boxes). Provide a separate Cookie Policy page describing each cookie's purpose and provider.",
    resources: [
      { label: "ICO Cookies guidance", url: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies/" },
    ],
    project_types: ["for-profit"],
    countries: ["UK"],
  },
  {
    key: "uk-data-retention-policy",
    item: "Data Retention Policy",
    priority: "recommended",
    category: "data",
    why: "UK GDPR principle (e) requires personal data to be kept no longer than necessary. A documented retention policy demonstrates accountability and helps with audits.",
    action: "Document how long each category of personal data is kept and the trigger for deletion. Implement automated cleanup where feasible (e.g., delete inactive user accounts after 24 months).",
    resources: [
      { label: "ICO Storage limitation guide", url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/" },
    ],
    project_types: ["for-profit"],
    countries: ["UK"],
  },
  {
    key: "uk-aadc",
    item: "Age-Appropriate Design Code compliance (if any users under 18)",
    priority: "recommended",
    category: "privacy",
    why: "ICO's Children's Code (AADC) requires online services likely to be accessed by children under 18 to apply 15 standards including high-privacy defaults and minimum data collection.",
    action: "Assess whether children are likely users. If yes, set high-privacy defaults, disable behavioral profiling for child accounts, provide age-appropriate transparency, and restrict location sharing.",
    resources: [
      { label: "ICO Children's Code", url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/" },
    ],
    project_types: ["for-profit"],
    countries: ["UK"],
  },

  // ============================================================
  // US (country)
  // ============================================================
  {
    key: "us-tos",
    item: "Terms of Service",
    priority: "blocker",
    category: "terms",
    why: "Forms the contract between you and your users. Without it, you have no legal basis to enforce account suspension, content removal, payment terms, or limit your liability.",
    action: "Publish ToS at /terms covering: acceptable use, account termination conditions, payment terms (if paid), liability limitations, dispute resolution (arbitration clause), governing law, and amendment process. Use clickwrap (checkbox at signup) not browsewrap.",
    resources: [
      { label: "Termly ToS template", url: "https://termly.io/products/terms-and-conditions-generator/" },
      { label: "Stripe Atlas legal docs", url: "https://stripe.com/atlas/guides" },
    ],
    project_types: ["for-profit"],
    countries: ["US"],
  },
  {
    key: "us-privacy-ccpa",
    item: "Privacy Policy with CCPA disclosures",
    priority: "blocker",
    category: "privacy",
    why: "California Consumer Privacy Act + CPRA require specific disclosures for any business with California users meeting revenue/data thresholds. Other states (Virginia VCDPA, Colorado CPA, Connecticut CTDPA, Utah UCPA) have similar laws — Privacy Policy should cover all.",
    action: "Publish at /privacy. Disclose: categories of personal information collected, sources, business purposes, third-party sharing, sale/share opt-out, consumer rights (know/delete/correct/opt-out). Add 'Do Not Sell or Share My Personal Information' link.",
    resources: [
      { label: "CCPA Compliance Checklist (OAG)", url: "https://oag.ca.gov/privacy/ccpa" },
      { label: "Termly CCPA template", url: "https://termly.io/products/privacy-policy-generator/" },
    ],
    project_types: ["for-profit"],
    countries: ["US"],
  },
  {
    key: "us-dmca",
    item: "DMCA Designated Agent registration",
    priority: "important",
    category: "ip",
    why: "Section 512 of the DMCA gives you safe harbor from copyright infringement liability for user-uploaded content — but only if you register a Designated Agent with the US Copyright Office and publish their contact info.",
    action: "Register a Designated Agent at dmca.copyright.gov ($6 fee) and publish the agent's contact info plus a takedown notice procedure on your site (e.g., /dmca page).",
    resources: [
      { label: "US Copyright Office DMCA Agent Registration", url: "https://www.copyright.gov/dmca-directory/" },
    ],
    project_types: ["for-profit"],
    countries: ["US"],
  },
  {
    key: "us-ada",
    item: "ADA Accessibility Statement",
    priority: "important",
    category: "accessibility",
    why: "Title III of the ADA has been increasingly applied to websites by US courts. Lawsuits target sites that fail WCAG 2.1 AA. A published statement plus genuine remediation effort reduces lawsuit risk.",
    action: "Audit against WCAG 2.1 AA. Publish an Accessibility Statement at /accessibility describing your conformance level, known limitations, contact info for accessibility issues, and remediation timeline.",
    resources: [
      { label: "WebAIM WCAG checklist", url: "https://webaim.org/standards/wcag/checklist" },
      { label: "ADA Title III website lawsuits tracker", url: "https://www.adatitleiii.com/" },
    ],
    project_types: ["for-profit"],
    countries: ["US"],
  },
  {
    key: "us-can-spam",
    item: "CAN-SPAM compliance for marketing email",
    priority: "important",
    category: "privacy",
    why: "Federal law governing commercial email. Requires accurate sender info, no deceptive subject lines, working unsubscribe links, and physical postal address in every commercial email. Penalties up to $51,744 per email.",
    action: "Every marketing email must: (1) include sender's physical postal address, (2) honor unsubscribe within 10 business days, (3) not use false header info or deceptive subjects, (4) clearly identify as advertising. Use a transactional/marketing email service that handles these (e.g., Resend, Postmark).",
    resources: [
      { label: "FTC CAN-SPAM Compliance Guide", url: "https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business" },
    ],
    project_types: ["for-profit"],
    countries: ["US"],
  },
  {
    key: "us-state-tax-nexus",
    item: "Sales tax nexus assessment (if selling to US consumers)",
    priority: "recommended",
    category: "tax",
    why: "Post-Wayfair (2018), states can require out-of-state sellers to collect sales tax once economic nexus thresholds are met (typically $100k revenue or 200 transactions per state per year). Each state has its own threshold.",
    action: "Track revenue and transaction count per US state. When approaching a threshold, register for a sales tax permit in that state. Use a service like TaxJar or Stripe Tax to automate detection and collection.",
    resources: [
      { label: "Stripe Tax", url: "https://stripe.com/tax" },
      { label: "TaxJar economic nexus guide", url: "https://www.taxjar.com/sales-tax/economic-nexus" },
    ],
    project_types: ["for-profit"],
    countries: ["US"],
  },
];
```

- [ ] **Step 2: Verify the catalog parses and counts are correct**

```bash
bun -e "import { LEGAL_CATALOG, itemsForCountry, itemsForRegion } from './server/src/lib/legal-catalog.ts'; console.log('total:', LEGAL_CATALOG.length); console.log('eu:', itemsForRegion('eu', 'for-profit').length); console.log('uk:', itemsForCountry('UK', 'for-profit').length); console.log('us:', itemsForCountry('US', 'for-profit').length);"
```

Expected output:
```
total: 18
eu: 7
uk: 5
us: 6
```

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/legal-catalog.ts
git commit -m "feat(legal): EU + UK + US catalog content"
```

---

## Task 4: Catalog Content — Russia (extensive)

**Files:**
- Modify: `server/src/lib/legal-catalog.ts` (append to `LEGAL_CATALOG`)

- [ ] **Step 1: Append the Russia items**

In `server/src/lib/legal-catalog.ts`, find the closing `];` of the `LEGAL_CATALOG` array. Insert the following items just before the closing `];`:

```typescript
  // ============================================================
  // Russia (country) — extensive coverage
  // ============================================================
  {
    key: "ru-152fz-privacy-policy",
    item: "Privacy Policy compliant with 152-ФЗ (in Russian)",
    priority: "blocker",
    category: "privacy",
    why: "Federal Law 152-ФЗ 'On Personal Data' requires every service processing Russian users' personal data to publish a Privacy Policy in Russian disclosing purposes, legal basis, retention periods, transfer locations, and user rights. Roskomnadzor enforces aggressively.",
    action: "Publish a Russian-language Privacy Policy (Политика конфиденциальности) at /privacy or /политика-конфиденциальности. Disclose: data categories collected, processing purposes, legal basis under Article 6 152-ФЗ, retention periods, sub-processors, user rights, contact info.",
    resources: [
      { label: "152-ФЗ full text (consultant.ru)", url: "https://www.consultant.ru/document/cons_doc_LAW_61801/" },
      { label: "Roskomnadzor official guidance", url: "https://rkn.gov.ru/personal-data/" },
      { label: "152-ФЗ on pravo.gov.ru", url: "http://pravo.gov.ru/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-rkn-operator-notification",
    item: "Roskomnadzor personal data operator notification (уведомление оператора ПД)",
    priority: "blocker",
    category: "data",
    why: "152-ФЗ Article 22 requires every entity processing personal data to file a notification with Roskomnadzor BEFORE processing begins (limited exemptions for employee-only data and small operators). Failure to register can lead to fines and site blocking.",
    action: "File the operator notification at pd.rkn.gov.ru. Required fields include: legal entity, processing purposes, data categories, legal basis, security measures, transfer locations. Once filed, you appear in the public operator register.",
    resources: [
      { label: "RKN operator register portal", url: "https://pd.rkn.gov.ru/" },
      { label: "How to file notification (RKN guide)", url: "https://rkn.gov.ru/personal-data/how-to/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-data-localization",
    item: "Data localization — store/process Russian users' personal data on servers physically in Russia (ФЗ-242)",
    priority: "blocker",
    category: "data",
    why: "ФЗ-242 (the 2014 amendment to 152-ФЗ) requires that the initial collection, recording, systematization, accumulation, storage, clarification, and extraction of personal data of Russian citizens be done using databases located in Russia. Roskomnadzor has blocked LinkedIn and other major services for non-compliance.",
    action: "Use a Russian hosting provider (Yandex Cloud, VK Cloud, Selectel, Beget, REG.RU) for the primary database storing personal data of Russian users. You can replicate to foreign servers AFTER initial localization, but the master must be in Russia.",
    resources: [
      { label: "ФЗ-242 explainer (consultant.ru)", url: "https://www.consultant.ru/document/cons_doc_LAW_165838/" },
      { label: "Yandex Cloud (Russian provider)", url: "https://cloud.yandex.ru/" },
      { label: "VK Cloud", url: "https://mcs.mail.ru/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-cross-border-transfer",
    item: "Cross-border data transfer notification to RKN",
    priority: "blocker",
    category: "data",
    why: "152-ФЗ Article 12 (as amended September 2022) requires operators to notify Roskomnadzor BEFORE transferring personal data abroad. The destination country must be on RKN's 'adequate protection' list, or the transfer requires explicit user consent and additional safeguards.",
    action: "Before any cross-border transfer, file a transfer notification with RKN via pd.rkn.gov.ru. List destination countries, purposes, and safeguards. If destination is not on the 'adequate' list, obtain explicit, informed user consent for each transfer.",
    resources: [
      { label: "RKN cross-border transfer guide", url: "https://rkn.gov.ru/personal-data/p333/" },
      { label: "List of countries with adequate protection", url: "https://rkn.gov.ru/personal-data/p333/p334/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-explicit-consent",
    item: "Explicit consent flow for personal data processing (separate signable document)",
    priority: "blocker",
    category: "privacy",
    why: "152-ФЗ requires consent for personal data processing to be specific, informed, and unambiguous. It cannot be bundled into ToS acceptance. For sensitive data and cross-border transfers, written form is required.",
    action: "Implement a separate consent checkbox at signup labeled 'Согласие на обработку персональных данных'. Link to a dedicated consent text page describing what data, why, who has access, and retention. Store consent timestamp + version per user.",
    resources: [
      { label: "152-ФЗ Article 9 (consent)", url: "https://www.consultant.ru/document/cons_doc_LAW_61801/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-marketing-consent",
    item: "Separate marketing consent (cannot be bundled with service consent)",
    priority: "important",
    category: "privacy",
    why: "152-ФЗ Article 9 + Federal Law on Advertising (38-ФЗ) require separate, freely-given consent for marketing communications. Marketing consent must NOT be a precondition for using the service.",
    action: "Add a separate, optional checkbox at signup: 'Согласие на получение маркетинговых рассылок'. Default to unchecked. Provide an unsubscribe link in every marketing email. Honor opt-outs immediately.",
    resources: [
      { label: "38-ФЗ on Advertising", url: "https://www.consultant.ru/document/cons_doc_LAW_58968/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-tos-zozpp",
    item: "User Agreement / ToS compliant with Consumer Protection Law (ЗоЗПП)",
    priority: "important",
    category: "terms",
    why: "Закон «О защите прав потребителей» governs all transactions with Russian consumers. Required disclosures include refund/return procedures, business identity, complaint process. Unfair contract terms are unenforceable.",
    action: "Publish a Russian-language User Agreement (Пользовательское соглашение) covering: business identity (ИНН, ОГРН, address), service description, payment terms, refund policy (14-day cooling-off for digital goods), dispute resolution, governing law (Russian law for Russian consumers).",
    resources: [
      { label: "ЗоЗПП full text (consultant.ru)", url: "https://www.consultant.ru/document/cons_doc_LAW_305/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-russian-language",
    item: "Russian-language interface for consumer-facing services",
    priority: "important",
    category: "terms",
    why: "Federal Law on the State Language of the Russian Federation (53-ФЗ) requires consumer-facing information to be available in Russian. Roskomnadzor and Rospotrebnadzor enforce this.",
    action: "Provide a Russian (ru) UI translation for all consumer-facing pages: signup, ToS, Privacy, support, billing. The Russian version must be at least as complete as any other language version.",
    resources: [
      { label: "53-ФЗ on State Language", url: "https://www.consultant.ru/document/cons_doc_LAW_53749/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-breach-notification",
    item: "Personal data breach notification protocol (24h to RKN, 72h to users)",
    priority: "important",
    category: "data",
    why: "152-ФЗ amendments effective March 2023 require operators to notify Roskomnadzor within 24 hours of detecting a data breach, with a follow-up report within 72 hours. Affected users must also be notified.",
    action: "Document an incident response runbook: detection, internal escalation, RKN notification within 24h via pd.rkn.gov.ru, user notification within 72h. Maintain an internal breach log.",
    resources: [
      { label: "RKN breach notification portal", url: "https://pd.rkn.gov.ru/" },
      { label: "152-ФЗ breach amendments overview", url: "https://www.consultant.ru/document/cons_doc_LAW_61801/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-dpo",
    item: "DPO appointment (if processor role or systematic monitoring)",
    priority: "recommended",
    category: "corporate",
    why: "152-ФЗ Article 22.1 requires the appointment of a person responsible for personal data processing if the operator is a legal entity. For systematic large-scale processing, a dedicated DPO function is strongly recommended.",
    action: "Appoint an internal Data Protection Officer (Ответственный за обработку персональных данных) by formal order. Document their responsibilities, authority, and contact info. List the DPO in your operator notification to RKN.",
    resources: [
      { label: "152-ФЗ Article 22.1 (consultant.ru)", url: "https://www.consultant.ru/document/cons_doc_LAW_61801/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-ori-registration",
    item: "ОРИ (Organizer of Information Dissemination) registration",
    priority: "important",
    category: "data",
    why: "Federal Law 97-ФЗ requires services that allow users to communicate with each other (messaging, comments, forums, social features) to register as Organizers of Information Dissemination with Roskomnadzor and store communication metadata for 1 year.",
    action: "If your service has user-to-user messaging, comments, or social features, register at rkn.gov.ru/communication/register/. Implement metadata storage (sender, recipient, timestamp, IP) for 1 year. Be prepared to provide data to authorities upon legal request.",
    resources: [
      { label: "ОРИ registration (RKN)", url: "https://rkn.gov.ru/communication/register/p922/" },
      { label: "97-ФЗ full text", url: "https://www.consultant.ru/document/cons_doc_LAW_162584/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
    feature_gated: "messaging",
  },
  {
    key: "ru-yarovaya",
    item: "Yarovaya law data retention (6mo content, 1yr metadata)",
    priority: "important",
    category: "data",
    why: "The Yarovaya package (374-ФЗ) requires Organizers of Information Dissemination to store the content of user communications for 6 months and metadata for 1 year, accessible to security services upon court order.",
    action: "Implement content storage (messages, attachments) for 6 months and metadata storage for 1 year on Russian-localized servers. Build a workflow for responding to lawful access requests.",
    resources: [
      { label: "374-ФЗ Yarovaya package overview", url: "https://www.consultant.ru/document/cons_doc_LAW_201078/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
    feature_gated: "messaging",
  },
  {
    key: "ru-vat-foreign",
    item: "VAT registration for foreign digital service sellers (244-ФЗ)",
    priority: "important",
    category: "tax",
    why: "Foreign companies selling digital services to Russian consumers (B2C) must register with the Federal Tax Service and remit Russian VAT on those sales. Threshold is zero — every transaction counts.",
    action: "If selling digital services from outside Russia to Russian consumers, register at lkioreg.nalog.ru. File quarterly VAT returns and remit collected VAT in rubles. Display VAT-inclusive prices in checkout.",
    resources: [
      { label: "Federal Tax Service e-services portal", url: "https://lkioreg.nalog.ru/" },
      { label: "244-ФЗ overview (Google Tax / Apple Tax)", url: "https://www.consultant.ru/document/cons_doc_LAW_181755/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-tax-entity",
    item: "Tax entity registration: ИП / Самозанятый / ООО depending on revenue scale",
    priority: "blocker",
    category: "tax",
    why: "Russian tax law requires anyone earning income from business activity to register a legal status. Самозанятый (self-employed) is simplest (4-6% tax, up to 2.4M RUB/year). ИП (sole proprietor) suits scaling solo founders. ООО is needed for partnerships, employees, or larger scale.",
    action: "Pick the right entity type: Самозанятый for early/solo (register via 'Мой налог' app, no fees), ИП for >2.4M RUB/year or hiring contractors (UFNS registration, simplified tax 6% or 15%), ООО for multiple founders or employees.",
    resources: [
      { label: "Federal Tax Service main site", url: "https://www.nalog.gov.ru/" },
      { label: "Мой налог app (self-employed)", url: "https://npd.nalog.ru/" },
      { label: "ИП registration step-by-step", url: "https://www.nalog.gov.ru/rn77/related_activities/registration_ip_yl/registration_ip/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
  {
    key: "ru-children-data",
    item: "Children's data special handling (under 18)",
    priority: "recommended",
    category: "privacy",
    why: "152-ФЗ Articles 9 and 14 require parental consent for processing personal data of minors under 14, and additional safeguards for users under 18. Sensitive data of minors has the strictest protection.",
    action: "If your service may have users under 18, add age verification at signup. For users under 14, require verified parental consent. Avoid collecting sensitive data from minors. Provide parental access to children's account data.",
    resources: [
      { label: "152-ФЗ Article 9", url: "https://www.consultant.ru/document/cons_doc_LAW_61801/" },
    ],
    project_types: ["for-profit"],
    countries: ["RU"],
  },
```

- [ ] **Step 2: Verify Russia counts**

```bash
bun -e "import { LEGAL_CATALOG, itemsForCountry } from './server/src/lib/legal-catalog.ts'; const ru = itemsForCountry('RU', 'for-profit'); console.log('ru count:', ru.length); console.log('ru blockers:', ru.filter(i => i.priority === 'blocker').length); console.log('total catalog:', LEGAL_CATALOG.length);"
```

Expected output:
```
ru count: 15
ru blockers: 6
total catalog: 33
```

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/legal-catalog.ts
git commit -m "feat(legal): Russia catalog content (15 items, extensive 152-ФЗ coverage)"
```

---

## Task 5: Catalog Content — DE/FR/NL extras + CA/AU/IN/BR/JP/SG + Open-Source

**Files:**
- Modify: `server/src/lib/legal-catalog.ts` (append to `LEGAL_CATALOG`)

- [ ] **Step 1: Append remaining country items + open-source items**

In `server/src/lib/legal-catalog.ts`, find the closing `];` of `LEGAL_CATALOG` again and insert before it:

```typescript
  // ============================================================
  // Germany (DE) — country-specific extras (on top of EU items)
  // ============================================================
  {
    key: "de-impressum",
    item: "Impressum (legally required imprint)",
    priority: "blocker",
    category: "terms",
    why: "Telemediengesetz §5 requires every German commercial website to publish an Impressum disclosing operator identity, address, contact info, business registration, VAT ID, and (for media) editorial responsibility. Easily enforced via Abmahnung (cease-and-desist letters from law firms).",
    action: "Publish an Impressum page (/impressum) with: full legal name, postal address (no PO box), email, phone, register entry (Handelsregister number), VAT ID (USt-IdNr.), and any required regulatory authority info.",
    resources: [
      { label: "TMG §5 (full text)", url: "https://www.gesetze-im-internet.de/tmg/__5.html" },
      { label: "e-Recht24 Impressum generator", url: "https://www.e-recht24.de/impressum-generator.html" },
    ],
    project_types: ["for-profit"],
    countries: ["DE"],
  },
  {
    key: "de-bdsg-supplemental",
    item: "BDSG supplemental privacy provisions (employee data, video surveillance)",
    priority: "recommended",
    category: "privacy",
    why: "Bundesdatenschutzgesetz (BDSG) supplements GDPR with German-specific rules around employee data processing, video surveillance, and credit scoring. If you handle employee or hiring data, BDSG applies.",
    action: "Review BDSG for relevance: employee data processing rules (§26), works council consultation requirements, video surveillance disclosures. Add a German employee privacy notice if you have German employees.",
    resources: [
      { label: "BDSG full text", url: "https://www.gesetze-im-internet.de/bdsg_2018/" },
    ],
    project_types: ["for-profit"],
    countries: ["DE"],
  },
  {
    key: "de-ttdsg",
    item: "TTDSG cookie/tracking consent (German implementation of ePrivacy)",
    priority: "important",
    category: "privacy",
    why: "Telekommunikation-Telemedien-Datenschutz-Gesetz (TTDSG) §25 codifies the cookie consent requirement in German law. Effective Dec 2021. Penalties via the Bundesnetzagentur and Aufsichtsbehörde.",
    action: "Ensure your cookie consent banner blocks all non-essential storage access until consent. The same banner satisfying EU ePrivacy generally satisfies TTDSG, but the German Aufsichtsbehörden expect strict implementation.",
    resources: [
      { label: "TTDSG full text", url: "https://www.gesetze-im-internet.de/ttdsg/" },
    ],
    project_types: ["for-profit"],
    countries: ["DE"],
  },

  // ============================================================
  // France (FR) — country-specific extras
  // ============================================================
  {
    key: "fr-cnil-mentions",
    item: "CNIL mentions légales + Privacy Policy compliant with French interpretation",
    priority: "blocker",
    category: "privacy",
    why: "Loi Informatique et Libertés + GDPR as enforced by CNIL has stricter cookie consent and transparency expectations than other EU regulators. CNIL fines reach €100M+.",
    action: "Publish 'Mentions légales' (legal notices) + 'Politique de confidentialité' (Privacy Policy) in French. Implement CNIL-compliant cookie banner: clear accept/refuse buttons, no dark patterns, granular categories.",
    resources: [
      { label: "CNIL website", url: "https://www.cnil.fr/" },
      { label: "CNIL cookie guidance", url: "https://www.cnil.fr/en/cookies-and-other-tracking-devices" },
    ],
    project_types: ["for-profit"],
    countries: ["FR"],
  },
  {
    key: "fr-toubon-language",
    item: "French language for consumer-facing content (Toubon Law)",
    priority: "important",
    category: "terms",
    why: "Loi Toubon (94-665) requires consumer-facing commercial communications, contracts, and product info to be in French. Translations into other languages are allowed alongside, but French is mandatory.",
    action: "Provide French translations of all consumer-facing pages: ToS, Privacy, signup, billing, support. Marketing copy aimed at French consumers must be in French.",
    resources: [
      { label: "Loi Toubon (Légifrance)", url: "https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000349929/" },
    ],
    project_types: ["for-profit"],
    countries: ["FR"],
  },

  // ============================================================
  // Netherlands (NL) — country-specific extras
  // ============================================================
  {
    key: "nl-ap-supervisory",
    item: "Autoriteit Persoonsgegevens (AP) as supervisory authority — local contact",
    priority: "important",
    category: "privacy",
    why: "Dutch DPA (Autoriteit Persoonsgegevens) is the supervisory authority for organizations established in NL or processing NL residents' data. AP has been increasingly active with enforcement.",
    action: "List AP as your supervisory authority in your Dutch Privacy Policy. Be ready to respond to AP inquiries within their stated deadlines (typically 4-6 weeks).",
    resources: [
      { label: "Autoriteit Persoonsgegevens", url: "https://autoriteitpersoonsgegevens.nl/" },
    ],
    project_types: ["for-profit"],
    countries: ["NL"],
  },
  {
    key: "nl-dutch-language-consumer",
    item: "Dutch language for consumer terms (consumer protection)",
    priority: "recommended",
    category: "terms",
    why: "Dutch consumer protection law expects contract terms aimed at Dutch consumers to be in Dutch (or another language the consumer can reasonably understand). English-only ToS may be unenforceable against Dutch consumers.",
    action: "Provide a Dutch translation of consumer-facing ToS and Privacy Policy. The Dutch version should be the binding version for Dutch consumers.",
    resources: [
      { label: "Consumentenbond consumer rights", url: "https://www.consumentenbond.nl/" },
    ],
    project_types: ["for-profit"],
    countries: ["NL"],
  },

  // ============================================================
  // Canada (CA)
  // ============================================================
  {
    key: "ca-pipeda-privacy",
    item: "PIPEDA-compliant Privacy Policy",
    priority: "blocker",
    category: "privacy",
    why: "Personal Information Protection and Electronic Documents Act governs commercial collection and use of personal information across most of Canada. Quebec has its own stricter Law 25.",
    action: "Publish a Privacy Policy disclosing: information collected, purposes, consent mechanism, retention, third-party sharing, individual access rights, and complaint process. Designate a Privacy Officer.",
    resources: [
      { label: "OPC PIPEDA guidance", url: "https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/" },
      { label: "Law 25 (Quebec)", url: "https://www.cai.gouv.qc.ca/" },
    ],
    project_types: ["for-profit"],
    countries: ["CA"],
  },
  {
    key: "ca-casl",
    item: "CASL compliance for commercial electronic messages",
    priority: "important",
    category: "privacy",
    why: "Canada's Anti-Spam Legislation requires express or implied consent before sending commercial electronic messages, plus sender identification and unsubscribe in every message. Penalties up to CAD $10M per violation.",
    action: "Obtain express consent at signup (separate checkbox). Identify sender in every CEM. Provide a working unsubscribe link with effect within 10 business days. Keep proof of consent.",
    resources: [
      { label: "CRTC CASL guidance", url: "https://crtc.gc.ca/eng/internet/anti.htm" },
    ],
    project_types: ["for-profit"],
    countries: ["CA"],
  },
  {
    key: "ca-bilingual-quebec",
    item: "French language for Quebec consumers (Charter of the French Language)",
    priority: "recommended",
    category: "terms",
    why: "Quebec's Charter of the French Language (Bill 96, in force since 2022) requires consumer-facing commerce in Quebec to be available in French. Applies to websites targeting Quebec consumers.",
    action: "Provide French translations of consumer-facing pages if you target Quebec users. The French version must be at least as prominent as English.",
    resources: [
      { label: "Office québécois de la langue française", url: "https://www.oqlf.gouv.qc.ca/" },
    ],
    project_types: ["for-profit"],
    countries: ["CA"],
  },

  // ============================================================
  // Australia (AU)
  // ============================================================
  {
    key: "au-privacy-act",
    item: "Privacy Policy compliant with Australian Privacy Principles (APPs)",
    priority: "blocker",
    category: "privacy",
    why: "Privacy Act 1988 (Cth) and the 13 APPs apply to most businesses with annual turnover over AUD $3M, plus all health service providers. Substantial 2023 reforms increase penalties to AUD $50M.",
    action: "Publish a Privacy Policy covering the 13 APPs: open and transparent management, anonymity, collection, dealing with personal info, direct marketing, use/disclosure, government identifiers, quality, security, access, correction, cross-border disclosure, identifier adoption.",
    resources: [
      { label: "OAIC Privacy Act guidance", url: "https://www.oaic.gov.au/privacy" },
    ],
    project_types: ["for-profit"],
    countries: ["AU"],
  },
  {
    key: "au-spam-act",
    item: "Spam Act 2003 compliance for commercial email",
    priority: "important",
    category: "privacy",
    why: "Spam Act requires consent (express or inferred), sender identification, and unsubscribe facility in every commercial electronic message. ACMA enforces with penalties up to AUD $2.2M per day for repeat offenses.",
    action: "Obtain consent at signup. Include sender identification + working unsubscribe in every commercial email. Honor unsubscribes within 5 business days.",
    resources: [
      { label: "ACMA Spam Act guide", url: "https://www.acma.gov.au/spam-and-telemarketing" },
    ],
    project_types: ["for-profit"],
    countries: ["AU"],
  },
  {
    key: "au-consumer-law",
    item: "Australian Consumer Law disclosures",
    priority: "recommended",
    category: "terms",
    why: "ACL provides statutory consumer guarantees that cannot be excluded by contract terms. Contract terms purporting to limit these guarantees are unfair and unenforceable.",
    action: "Review your ToS for unfair contract terms (especially limitation of liability, refund exclusions). Add ACL disclosures: statutory guarantees apply, refund eligibility, dispute resolution.",
    resources: [
      { label: "ACCC consumer guarantees", url: "https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees" },
    ],
    project_types: ["for-profit"],
    countries: ["AU"],
  },

  // ============================================================
  // India (IN)
  // ============================================================
  {
    key: "in-dpdp-act",
    item: "DPDP Act 2023 compliance",
    priority: "blocker",
    category: "privacy",
    why: "Digital Personal Data Protection Act 2023 is India's first comprehensive data protection law. Requires consent, purpose limitation, data minimization, breach notification, and grievance redressal. Penalties up to INR 250 crore.",
    action: "Publish a Privacy Notice in English (and ideally regional languages). Implement consent management, data principal rights (access, correction, erasure, grievance), and a designated Data Protection Officer for significant data fiduciaries.",
    resources: [
      { label: "DPDP Act 2023 (PRS Legislative Research)", url: "https://prsindia.org/billtrack/the-digital-personal-data-protection-bill-2023" },
      { label: "MeitY website", url: "https://www.meity.gov.in/" },
    ],
    project_types: ["for-profit"],
    countries: ["IN"],
  },
  {
    key: "in-it-act-intermediary",
    item: "IT Act intermediary guidelines compliance",
    priority: "important",
    category: "data",
    why: "IT Act 2000 + Intermediary Guidelines 2021 require online intermediaries to publish rules, designate grievance officers, respond to government takedown requests, and implement traceability for messaging services with >5M Indian users.",
    action: "Publish intermediary rules. Designate a Grievance Officer (Indian resident). Set up takedown response procedure. For large messaging services, plan for traceability requirements.",
    resources: [
      { label: "IT Rules 2021 (MeitY)", url: "https://www.meity.gov.in/content/notification" },
    ],
    project_types: ["for-profit"],
    countries: ["IN"],
  },

  // ============================================================
  // Brazil (BR)
  // ============================================================
  {
    key: "br-lgpd",
    item: "LGPD-compliant Privacy Policy (in Portuguese)",
    priority: "blocker",
    category: "privacy",
    why: "Lei Geral de Proteção de Dados (LGPD) is Brazil's GDPR-equivalent law. Applies to any processing of Brazilian residents' data, including by foreign companies. ANPD enforces with fines up to 2% of revenue (capped at BRL 50M).",
    action: "Publish a Portuguese Privacy Policy disclosing: data categories, purposes, legal basis, retention, sharing, user rights (access, correction, deletion, portability), and DPO contact. Appoint an Encarregado (DPO).",
    resources: [
      { label: "LGPD full text (planalto.gov.br)", url: "http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm" },
      { label: "ANPD website", url: "https://www.gov.br/anpd/" },
    ],
    project_types: ["for-profit"],
    countries: ["BR"],
  },
  {
    key: "br-cdc-consumer",
    item: "Código de Defesa do Consumidor (CDC) compliance",
    priority: "important",
    category: "terms",
    why: "Brazilian Consumer Defense Code provides strong consumer protection that overrides contract terms. Requires clear disclosure of terms, right to cancel digital purchases within 7 days, and prohibits abusive clauses.",
    action: "Publish ToS in Portuguese covering CDC requirements: clear identification of seller, total price, cancellation right (7-day cooling off for distance sales), refund procedure, complaint channel.",
    resources: [
      { label: "CDC full text (planalto.gov.br)", url: "http://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm" },
    ],
    project_types: ["for-profit"],
    countries: ["BR"],
  },

  // ============================================================
  // Japan (JP)
  // ============================================================
  {
    key: "jp-appi",
    item: "APPI-compliant Privacy Policy",
    priority: "blocker",
    category: "privacy",
    why: "Act on the Protection of Personal Information (APPI) is Japan's main data protection law. 2022 amendments strengthened individual rights and breach notification. PPC (Personal Information Protection Commission) enforces.",
    action: "Publish a Japanese-language Privacy Policy disclosing: personal info handled, purposes, joint use partners, security measures, user rights (disclosure, correction, suspension of use, deletion). Designate a contact point.",
    resources: [
      { label: "PPC website (English)", url: "https://www.ppc.go.jp/en/" },
      { label: "APPI English text", url: "https://www.ppc.go.jp/files/pdf/APPI_english.pdf" },
    ],
    project_types: ["for-profit"],
    countries: ["JP"],
  },
  {
    key: "jp-tokushoho",
    item: "Specified Commercial Transactions Act disclosures (特定商取引法)",
    priority: "important",
    category: "terms",
    why: "Tokushoho requires online sellers to publish detailed business info: legal name, address, phone, person in charge, payment methods, delivery, refund policy. Consumer Affairs Agency enforces with fines and business suspensions.",
    action: "Publish a 特定商取引法に基づく表記 (Tokushoho-based disclosure) page with all required fields. Translation: keep it in Japanese; English versions don't satisfy the requirement.",
    resources: [
      { label: "Consumer Affairs Agency Tokushoho", url: "https://www.no-trouble.caa.go.jp/" },
    ],
    project_types: ["for-profit"],
    countries: ["JP"],
  },

  // ============================================================
  // Singapore (SG)
  // ============================================================
  {
    key: "sg-pdpa",
    item: "PDPA-compliant Privacy Policy",
    priority: "blocker",
    category: "privacy",
    why: "Personal Data Protection Act 2012 governs collection, use, and disclosure of personal data in Singapore. PDPC (Personal Data Protection Commission) enforces with fines up to SGD $1M or 10% of annual turnover.",
    action: "Publish a Privacy Policy covering the 11 PDPA obligations: consent, purpose limitation, notification, access and correction, accuracy, protection, retention limitation, transfer limitation, openness, accountability, data breach notification.",
    resources: [
      { label: "PDPC PDPA Overview", url: "https://www.pdpc.gov.sg/Overview-of-PDPA/The-Legislation/Personal-Data-Protection-Act" },
    ],
    project_types: ["for-profit"],
    countries: ["SG"],
  },
  {
    key: "sg-spam-control",
    item: "Spam Control Act for marketing messages",
    priority: "important",
    category: "privacy",
    why: "Singapore's Spam Control Act requires unsolicited commercial electronic messages to include sender identification, unsubscribe option, and 'ADV' label in subject line for unsolicited content.",
    action: "Identify sender in every marketing message. Provide working unsubscribe within 10 business days. Add 'ADV' or '<ADV>' prefix in subject line for unsolicited commercial messages.",
    resources: [
      { label: "Singapore Spam Control Act", url: "https://sso.agc.gov.sg/Act/SCA2007" },
    ],
    project_types: ["for-profit"],
    countries: ["SG"],
  },

  // ============================================================
  // Open Source items (universal across all listed countries)
  // ============================================================
  {
    key: "oss-pick-license",
    item: "Pick an OSS license (MIT / Apache 2.0 / GPL / etc.)",
    priority: "blocker",
    category: "ip",
    why: "Code without an explicit license is 'all rights reserved' by default — nobody can legally use, modify, or distribute it. Picking a license is the single most important legal step for an open-source project.",
    action: "Pick a license that matches your goals: MIT (most permissive), Apache 2.0 (permissive + patent grant), GPLv3 (copyleft, requires derivative works to also be GPL), AGPL (network use also triggers copyleft). Add the license name to your repo description.",
    resources: [
      { label: "choosealicense.com", url: "https://choosealicense.com/" },
      { label: "OSI approved licenses", url: "https://opensource.org/licenses" },
    ],
    project_types: ["open-source"],
    countries: ["US", "UK", "DE", "FR", "NL", "CA", "AU", "IN", "BR", "JP", "SG", "RU"],
  },
  {
    key: "oss-license-file",
    item: "Add LICENSE file to repository root",
    priority: "blocker",
    category: "ip",
    why: "GitHub, package registries (npm, PyPI, crates.io), and license-detection tools look for a LICENSE file in the repo root. Without it, your license declaration may not be picked up automatically.",
    action: "Create a LICENSE file in the repository root containing the full text of your chosen license, with copyright year and holder name. choosealicense.com provides ready-to-paste templates.",
    resources: [
      { label: "GitHub Adding a license", url: "https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-a-license-to-a-repository" },
    ],
    project_types: ["open-source"],
    countries: ["US", "UK", "DE", "FR", "NL", "CA", "AU", "IN", "BR", "JP", "SG", "RU"],
  },
  {
    key: "oss-copyright-headers",
    item: "Copyright headers in source files",
    priority: "recommended",
    category: "ip",
    why: "Per-file copyright headers make ownership clear when files are extracted from the repo. Some licenses (Apache 2.0) explicitly require this. Helps with attribution in derivative works.",
    action: "Add a short copyright header to each source file: copyright year, holder name, license SPDX identifier (e.g., 'SPDX-License-Identifier: MIT'). Tools like reuse-tool can automate this.",
    resources: [
      { label: "REUSE Software", url: "https://reuse.software/" },
      { label: "SPDX license list", url: "https://spdx.org/licenses/" },
    ],
    project_types: ["open-source"],
    countries: ["US", "UK", "DE", "FR", "NL", "CA", "AU", "IN", "BR", "JP", "SG", "RU"],
  },
  {
    key: "oss-trademark-check",
    item: "Trademark check for project name",
    priority: "recommended",
    category: "ip",
    why: "Choosing a project name that conflicts with an existing trademark can lead to forced renames or legal disputes — even for open-source projects. A 5-minute check now prevents painful rebranding later.",
    action: "Search USPTO TESS, EUIPO TMview, and Google for the proposed name + 'trademark'. Check npm/PyPI/crates.io for naming conflicts. Avoid generic terms and corporate-sounding names of large companies.",
    resources: [
      { label: "USPTO TESS trademark search", url: "https://tmsearch.uspto.gov/" },
      { label: "EUIPO TMview", url: "https://www.tmdn.org/tmview/" },
    ],
    project_types: ["open-source"],
    countries: ["US", "UK", "DE", "FR", "NL", "CA", "AU", "IN", "BR", "JP", "SG", "RU"],
  },
  {
    key: "oss-cla-decision",
    item: "Contributor License Agreement (CLA) decision",
    priority: "recommended",
    category: "ip",
    why: "CLAs let project owners relicense or commercialize the project later by ensuring contributors grant broad rights. They also create friction that discourages drive-by contributions. Pick the right tradeoff for your project.",
    action: "Decide: no CLA (simplest, smaller community), DCO (Developer Certificate of Origin — lightweight, used by Linux), or full CLA (formal agreement, used by Apache). Document your choice in CONTRIBUTING.md.",
    resources: [
      { label: "DCO explainer", url: "https://developercertificate.org/" },
      { label: "Apache CLA template", url: "https://www.apache.org/licenses/contributor-agreements.html" },
    ],
    project_types: ["open-source"],
    countries: ["US", "UK", "DE", "FR", "NL", "CA", "AU", "IN", "BR", "JP", "SG", "RU"],
  },
```

- [ ] **Step 2: Verify final catalog counts**

```bash
bun -e "import { LEGAL_CATALOG, itemsForCountry, itemsForRegion } from './server/src/lib/legal-catalog.ts'; console.log('total:', LEGAL_CATALOG.length); console.log('---'); for (const cc of ['US','UK','DE','FR','NL','CA','AU','IN','BR','JP','SG','RU']) { console.log(cc, 'for-profit:', itemsForCountry(cc, 'for-profit').length, 'open-source:', itemsForCountry(cc, 'open-source').length); } console.log('eu region for-profit:', itemsForRegion('eu', 'for-profit').length);"
```

Expected output (counts may shift slightly):
```
total: 56
---
US for-profit: 6 open-source: 5
UK for-profit: 5 open-source: 5
DE for-profit: 3 open-source: 5
FR for-profit: 2 open-source: 5
NL for-profit: 2 open-source: 5
CA for-profit: 3 open-source: 5
AU for-profit: 3 open-source: 5
IN for-profit: 2 open-source: 5
BR for-profit: 2 open-source: 5
JP for-profit: 2 open-source: 5
SG for-profit: 2 open-source: 5
RU for-profit: 15 open-source: 5
eu region for-profit: 7
```

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/legal-catalog.ts
git commit -m "feat(legal): country-specific extras + open-source items"
```

---

## Task 6: LLM Wrapper Functions

**Files:**
- Create: `server/src/lib/legal-llm.ts`

- [ ] **Step 1: Create the wrapper file**

```typescript
import { generateText } from "./llm.ts";
import type { LegalCatalogItem, LegalPriority, LegalCategory } from "./legal-catalog.ts";

export interface LegalProjectContext {
  name: string;
  description: string | null;
  type: string;
  stage: string;
}

export interface EnrichmentResult {
  key: string;
  personalized_action: string;
  skip_due_to_feature_gate: boolean;
}

/**
 * Personalizes the `action` field of catalog items based on project context.
 * Constrained contract: the LLM cannot add, remove, or rename items — it only
 * rewrites action text. Returns generic actions on failure (never throws).
 */
export async function enrichSeedItems(
  project: LegalProjectContext,
  items: LegalCatalogItem[]
): Promise<EnrichmentResult[]> {
  if (items.length === 0) return [];

  const systemPrompt = `You personalize compliance action text for a specific project. You DO NOT add, remove, or rename items. You only rewrite the \`action\` field to be specific to this project's tech stack and description. If the generic action is already specific enough, return it verbatim.

Rules:
- Never invent items not in the input
- If an input item has \`feature_gated\` and the project description gives no evidence of that feature, set \`skip_due_to_feature_gate: true\`
- Personalize using concrete tech stack details from the description when possible (e.g., "Your stack uses PostHog and Supabase — your privacy policy must list these processors")
- Keep personalized actions under 200 words
- Output VALID JSON only, no surrounding prose`;

  const userPayload = {
    project: {
      name: project.name,
      description: project.description ?? "",
      type: project.type,
      stage: project.stage,
    },
    items: items.map((it) => ({
      key: it.key,
      item: it.item,
      why: it.why,
      generic_action: it.action,
      feature_gated: it.feature_gated ?? null,
    })),
  };

  const prompt = `${systemPrompt}\n\nINPUT:\n${JSON.stringify(userPayload, null, 2)}\n\nOUTPUT (JSON only):\n{ "items": [{ "key": "...", "personalized_action": "...", "skip_due_to_feature_gate": false }] }`;

  try {
    const response = await Promise.race([
      generateText(prompt, { maxTokens: 4096, temperature: 0.2 }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("LLM timeout")), 5000)
      ),
    ]);

    const parsed = parseJsonResponse(response);
    if (!parsed?.items || !Array.isArray(parsed.items)) {
      throw new Error("LLM response missing items array");
    }

    // Build a result map keyed by item key, so we can safely fall back per-item
    const resultByKey = new Map<string, EnrichmentResult>();
    for (const r of parsed.items) {
      if (typeof r?.key === "string" && typeof r?.personalized_action === "string") {
        resultByKey.set(r.key, {
          key: r.key,
          personalized_action: r.personalized_action,
          skip_due_to_feature_gate: r.skip_due_to_feature_gate === true,
        });
      }
    }

    return items.map((it) => {
      const r = resultByKey.get(it.key);
      if (r) return r;
      return { key: it.key, personalized_action: it.action, skip_due_to_feature_gate: false };
    });
  } catch (err) {
    console.warn("[legal-llm] enrichSeedItems failed, falling back to generic actions:", (err as Error).message);
    return items.map((it) => ({
      key: it.key,
      personalized_action: it.action,
      skip_due_to_feature_gate: false,
    }));
  }
}

export interface ReviewedItem {
  id: string;
  country_code: string;
  scope: "country" | "region";
  scope_code: string | null;
  item: string;
  priority: LegalPriority | null;
  category: LegalCategory | null;
  why: string | null;
  action: string | null;
}

export interface MissingItem {
  item: string;
  priority: LegalPriority;
  category: LegalCategory;
  why: string;
  action: string;
  resources: { label: string; url: string }[];
  country_code: string;
  scope: "country" | "region";
  scope_code: string | null;
}

export interface LegalReviewDiff {
  ok: string[];
  stale: { id: string; status_note: string }[];
  rename: { id: string; new_item: string }[];
  missing: MissingItem[];
  removed: string[];
}

/**
 * Audits current items against the catalog snapshot. Returns a structured diff.
 * Prefers conservative output (default to `ok` when uncertain). Throws on
 * unrecoverable errors so the caller can return HTTP 503 with retry info.
 */
export async function reviewItems(
  project: LegalProjectContext,
  currentItems: ReviewedItem[],
  catalog: LegalCatalogItem[]
): Promise<LegalReviewDiff> {
  const systemPrompt = `You audit a project's compliance items against a catalog of canonical requirements. You return a structured diff of what's stale, missing, renamed, or no longer applicable. You are conservative — when in legal uncertainty, mark items as \`ok\` rather than \`stale\` or \`removed\`.

Rules:
- For \`missing\`, prefer items from the catalog. Only include LLM-suggested items not in the catalog if you are highly confident
- For \`removed\`, only include items where you are confident the requirement was repealed or doesn't apply
- For \`stale\`, the \`status_note\` must be specific (e.g., "EU AI Act Article 50 transparency requirements take effect August 2026")
- Default to \`ok\` when uncertain
- Output VALID JSON only, no surrounding prose`;

  const userPayload = {
    project: {
      name: project.name,
      description: project.description ?? "",
      type: project.type,
      stage: project.stage,
    },
    current_items: currentItems,
    catalog: catalog.map((it) => ({
      item: it.item,
      priority: it.priority,
      category: it.category,
      why: it.why,
      action: it.action,
      resources: it.resources,
      countries: it.countries ?? null,
      region: it.region ?? null,
    })),
  };

  const prompt = `${systemPrompt}\n\nINPUT:\n${JSON.stringify(userPayload, null, 2)}\n\nOUTPUT (JSON only):\n{ "ok": ["<id>"], "stale": [{"id":"<id>","status_note":"..."}], "rename": [{"id":"<id>","new_item":"..."}], "missing": [{"item":"...","priority":"...","category":"...","why":"...","action":"...","resources":[],"country_code":"...","scope":"country","scope_code":null}], "removed": ["<id>"] }`;

  const response = await Promise.race([
    generateText(prompt, { maxTokens: 8192, temperature: 0.2 }),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("LLM timeout")), 15000)
    ),
  ]);

  const parsed = parseJsonResponse(response);
  if (!parsed) throw new Error("LLM returned invalid JSON");

  return {
    ok: Array.isArray(parsed.ok) ? parsed.ok.filter((x: unknown) => typeof x === "string") : [],
    stale: Array.isArray(parsed.stale)
      ? parsed.stale.filter((x: any) => typeof x?.id === "string" && typeof x?.status_note === "string")
      : [],
    rename: Array.isArray(parsed.rename)
      ? parsed.rename.filter((x: any) => typeof x?.id === "string" && typeof x?.new_item === "string")
      : [],
    missing: Array.isArray(parsed.missing)
      ? parsed.missing.filter((x: any) => typeof x?.item === "string" && typeof x?.country_code === "string")
      : [],
    removed: Array.isArray(parsed.removed) ? parsed.removed.filter((x: unknown) => typeof x === "string") : [],
  };
}

/**
 * Extracts the first JSON object from an LLM response. Handles cases where
 * the model wraps the JSON in markdown fences or surrounding prose.
 */
function parseJsonResponse(text: string): any {
  if (!text) return null;
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {}
  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {}
  }
  // Find first { and last } and try parsing that slice
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }
  return null;
}
```

- [ ] **Step 2: Verify the file imports cleanly**

```bash
bun -e "import { enrichSeedItems, reviewItems } from './server/src/lib/legal-llm.ts'; console.log('imports OK', typeof enrichSeedItems, typeof reviewItems);"
```

Expected output: `imports OK function function`

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/legal-llm.ts
git commit -m "feat(legal): LLM wrapper with enrichSeedItems + reviewItems"
```

---

## Task 7: Server — Replace Country-Add Seeding with Catalog + LLM Enrichment + EU Auto-Attach

**Files:**
- Modify: `server/src/routes/projects.ts:4-7` (imports), `:352-379` (POST /countries handler)

- [ ] **Step 1: Update imports**

Open `server/src/routes/projects.ts`. Find line 4:

```typescript
import { getDefaultChecklist } from "../lib/constants.ts";
```

Add this immediately after it:

```typescript
import { LEGAL_CATALOG, itemsForCountry, itemsForRegion, isEuMember, type LegalProjectType, type LegalCatalogItem } from "../lib/legal-catalog.ts";
import { enrichSeedItems } from "../lib/legal-llm.ts";
```

- [ ] **Step 2: Remove the static `LEGAL_REQUIREMENTS` map**

Find the `LEGAL_REQUIREMENTS` const (lines 7-21). Delete the entire block:

```typescript
const LEGAL_REQUIREMENTS: Record<string, string[]> = {
  EU:  [...],
  US:  [...],
  // ... all 13 entries ...
  RU:  [...],
};
```

(Total deletion: ~14 lines. Remove the whole `const LEGAL_REQUIREMENTS = { ... };` block and the blank line after it if any.)

- [ ] **Step 3: Replace the POST /countries handler**

Find the existing POST `/:id/countries` handler (around line 352-379):

```typescript
// POST /api/projects/:id/countries — auto-seeds legal items
router.post("/:id/countries", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { country_code, country_name } = await c.req.json();
  if (!country_code || !country_name) return c.json({ error: "country_code and country_name required" }, 400);

  const id = crypto.randomUUID();
  db.run("INSERT INTO project_countries (id, project_id, country_code, country_name) VALUES (?, ?, ?, ?)",
    [id, c.req.param("id"), country_code, country_name]);

  // Seed legal items (skip if already exist for this country)
  const items = LEGAL_REQUIREMENTS[country_code] ?? [];
  const existing = db.query<{ item: string }, [string, string]>(
    "SELECT item FROM legal_items WHERE project_id = ? AND country_code = ?"
  ).all(c.req.param("id"), country_code).map(r => r.item);

  const now = Date.now();
  for (const item of items) {
    if (!existing.includes(item)) {
      db.run("INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)",
        [crypto.randomUUID(), c.req.param("id"), country_code, item, now]);
    }
  }

  return c.json(db.query<ProjectCountry, [string]>("SELECT * FROM project_countries WHERE id = ?").get(id), 201);
});
```

Replace with:

```typescript
// POST /api/projects/:id/countries — auto-seeds rich legal items + LLM-enriched action text
router.post("/:id/countries", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { country_code, country_name } = await c.req.json();
  if (!country_code || !country_name) return c.json({ error: "country_code and country_name required" }, 400);

  const projectId = c.req.param("id");
  const project = db.query<{ name: string; description: string | null; type: string; stage: string }, [string]>(
    "SELECT name, description, type, stage FROM projects WHERE id = ?"
  ).get(projectId);
  if (!project) return c.json({ error: "Not found" }, 404);

  const projectType: LegalProjectType = project.type === "open-source" ? "open-source" : "for-profit";

  // Insert the country row
  const countryRowId = crypto.randomUUID();
  db.run("INSERT INTO project_countries (id, project_id, country_code, country_name) VALUES (?, ?, ?, ?)",
    [countryRowId, projectId, country_code, country_name]);

  // Build the queue of items to seed
  const queue: { catalogItem: LegalCatalogItem; targetCountryCode: string; scope: "country" | "region"; scopeCode: string | null }[] = [];

  // 1. Items for this specific country
  for (const it of itemsForCountry(country_code, projectType)) {
    queue.push({ catalogItem: it, targetCountryCode: country_code, scope: "country", scopeCode: null });
  }

  // 2. EU auto-attach: if this is an EU member and the project has no existing EU region items, queue them
  if (isEuMember(country_code)) {
    const existingEu = db.query<{ id: string }, [string]>(
      "SELECT id FROM legal_items WHERE project_id = ? AND scope = 'region' AND scope_code = 'eu' LIMIT 1"
    ).get(projectId);
    if (!existingEu) {
      for (const it of itemsForRegion("eu", projectType)) {
        queue.push({ catalogItem: it, targetCountryCode: "", scope: "region", scopeCode: "eu" });
      }
    }
  }

  // 3. Skip items already seeded for this country (idempotent re-add)
  const existingKeys = new Set(
    db.query<{ item: string }, [string, string]>(
      "SELECT item FROM legal_items WHERE project_id = ? AND country_code = ?"
    ).all(projectId, country_code).map(r => r.item)
  );
  const filteredQueue = queue.filter(q => !existingKeys.has(q.catalogItem.item));

  // 4. Run LLM enrichment (5s timeout, falls back to generic actions on failure)
  const enrichments = await enrichSeedItems(
    {
      name: project.name,
      description: project.description,
      type: project.type,
      stage: project.stage,
    },
    filteredQueue.map(q => q.catalogItem)
  );
  const enrichmentByKey = new Map(enrichments.map(e => [e.key, e]));

  // 5. Insert each item with full metadata
  const now = Date.now();
  for (const q of filteredQueue) {
    const enrichment = enrichmentByKey.get(q.catalogItem.key);
    const personalizedAction = enrichment?.personalized_action ?? q.catalogItem.action;
    const featureGateNote = enrichment?.skip_due_to_feature_gate
      ? `Only relevant if your service has ${q.catalogItem.feature_gated} features — review and delete if not applicable`
      : null;

    db.run(
      `INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at,
        priority, category, why, action, resources, scope, scope_code, last_reviewed_at, status_note)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        projectId,
        q.targetCountryCode,
        q.catalogItem.item,
        now,
        q.catalogItem.priority,
        q.catalogItem.category,
        q.catalogItem.why,
        personalizedAction,
        JSON.stringify(q.catalogItem.resources),
        q.scope,
        q.scopeCode,
        now,
        featureGateNote,
      ]
    );
  }

  return c.json(db.query<ProjectCountry, [string]>("SELECT * FROM project_countries WHERE id = ?").get(countryRowId), 201);
});
```

- [ ] **Step 4: Verify imports compile and the route file loads**

```bash
bun -e "import './server/src/routes/projects.ts'; console.log('OK');"
```

Expected output: `OK`

- [ ] **Step 5: Manual test — kill any running server, start fresh, add a country**

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null
cd /Users/glebstarcikov/Launchpad && bun run dev > /tmp/launchpad-dev.log 2>&1 &
sleep 3
```

Then create a test project and add Germany via curl (replace `<COOKIE>` with your auth cookie value, or use the UI):

```bash
# Quickest: open the app in a browser, create a new for-profit project,
# then go to Legal tab and add Germany. Verify items appear in the DB:
bun -e "import { db } from './server/src/db/index.ts'; const rows = db.query('SELECT country_code, item, scope, scope_code, priority, category, length(action) as action_len FROM legal_items WHERE created_at > ?').all(Date.now() - 60000); console.log(rows);"
```

Expected: rows for Germany (`country_code: 'DE'`, `scope: 'country'`) AND for EU (`country_code: ''`, `scope: 'region'`, `scope_code: 'eu'`). Each row has non-null `priority`, `category`, and a non-zero `action_len`.

If the LLM is unavailable (no Ollama, no Anthropic key), the items should still seed with generic action text — verify the dev log shows `[legal-llm] enrichSeedItems failed, falling back to generic actions` but the items are present.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/projects.ts
git commit -m "feat(legal): rich catalog seeding + EU auto-attach + LLM enrichment on country add"
```

---

## Task 8: Server — EU Cascade on DELETE /countries

**Files:**
- Modify: `server/src/routes/projects.ts:381-389` (DELETE /countries handler)

- [ ] **Step 1: Replace the DELETE handler**

Find the existing DELETE `/:id/countries/:cId` handler:

```typescript
// DELETE /api/projects/:id/countries/:cId — FK CASCADE removes legal_items automatically
router.delete("/:id/countries/:cId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  db.run("DELETE FROM project_countries WHERE id = ? AND project_id = ?",
    [c.req.param("cId"), c.req.param("id")]);
  return c.json({ ok: true });
});
```

Replace with:

```typescript
// DELETE /api/projects/:id/countries/:cId — FK CASCADE removes country-scoped legal_items;
// also cascades EU-region items if no EU members remain.
router.delete("/:id/countries/:cId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const projectId = c.req.param("id");
  const cId = c.req.param("cId");

  // Lookup the country code BEFORE we delete the row
  const country = db.query<{ country_code: string }, [string, string]>(
    "SELECT country_code FROM project_countries WHERE id = ? AND project_id = ?"
  ).get(cId, projectId);

  db.run("DELETE FROM project_countries WHERE id = ? AND project_id = ?", [cId, projectId]);

  // If the removed country was an EU member, check whether any EU members remain.
  // If not, also delete the EU-region legal items.
  if (country && isEuMember(country.country_code)) {
    const remainingEu = db.query<{ country_code: string }, [string]>(
      "SELECT country_code FROM project_countries WHERE project_id = ?"
    ).all(projectId).filter(r => isEuMember(r.country_code));
    if (remainingEu.length === 0) {
      db.run(
        "DELETE FROM legal_items WHERE project_id = ? AND scope = 'region' AND scope_code = 'eu'",
        [projectId]
      );
    }
  }

  return c.json({ ok: true });
});
```

- [ ] **Step 2: Verify imports + syntax**

```bash
bun -e "import './server/src/routes/projects.ts'; console.log('OK');"
```

Expected output: `OK`

- [ ] **Step 3: Manual test — add DE, then add FR, then remove DE; EU items should remain (FR is still EU). Then remove FR; EU items should disappear.**

Use the UI or:

```bash
bun -e "
import { db } from './server/src/db/index.ts';
// Find any project that has both DE and FR
const projectId = db.query('SELECT DISTINCT project_id FROM project_countries WHERE country_code IN (\\'DE\\', \\'FR\\') LIMIT 1').get();
if (!projectId) { console.log('No test project with EU members — add DE/FR via UI first'); }
else {
  const eu = db.query('SELECT count(*) as c FROM legal_items WHERE project_id = ? AND scope = \\'region\\' AND scope_code = \\'eu\\'').get(projectId.project_id);
  console.log('EU items:', eu.c);
}
"
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/projects.ts
git commit -m "feat(legal): cascade EU-region items when last EU member country is removed"
```

---

## Task 9: Server — Extend GET/POST/PUT /legal Endpoints for Metadata

**Files:**
- Modify: `server/src/routes/projects.ts:391-435`

- [ ] **Step 1: Replace the GET handler with metadata-aware ordering**

Find the existing GET `/:id/legal` handler:

```typescript
// GET /api/projects/:id/legal
router.get("/:id/legal", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    db.query<LegalItem, [string]>(
      "SELECT * FROM legal_items WHERE project_id = ? ORDER BY country_code, created_at ASC"
    ).all(c.req.param("id"))
  );
});
```

Replace with:

```typescript
// GET /api/projects/:id/legal
router.get("/:id/legal", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const rows = db.query<LegalItem & { resources: string | null }, [string]>(
    `SELECT * FROM legal_items WHERE project_id = ?
     ORDER BY scope DESC, country_code ASC,
       CASE priority WHEN 'blocker' THEN 1 WHEN 'important' THEN 2 WHEN 'recommended' THEN 3 ELSE 4 END,
       created_at ASC`
  ).all(c.req.param("id"));
  // Parse resources JSON for each row; default to [] for legacy items
  const parsed = rows.map(r => ({
    ...r,
    resources: r.resources ? JSON.parse(r.resources) : [],
  }));
  return c.json(parsed);
});
```

- [ ] **Step 2: Replace the POST handler to accept metadata fields**

Find the existing POST `/:id/legal` handler:

```typescript
// POST /api/projects/:id/legal — add custom item
router.post("/:id/legal", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { country_code, item } = await c.req.json();
  if (!country_code || !item) return c.json({ error: "country_code and item required" }, 400);
  const id = crypto.randomUUID();
  db.run("INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    [id, c.req.param("id"), country_code, item, Date.now()]);
  return c.json(db.query<LegalItem, [string]>("SELECT * FROM legal_items WHERE id = ?").get(id), 201);
});
```

Replace with:

```typescript
// POST /api/projects/:id/legal — add custom item (with optional metadata)
router.post("/:id/legal", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { country_code, item, priority, category, why, action, resources, scope, scope_code } = await c.req.json();
  if (!country_code && !scope_code) return c.json({ error: "country_code or scope_code required" }, 400);
  if (!item) return c.json({ error: "item required" }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run(
    `INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at,
      priority, category, why, action, resources, scope, scope_code)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      c.req.param("id"),
      country_code ?? "",
      item,
      now,
      priority ?? null,
      category ?? null,
      why ?? null,
      action ?? null,
      JSON.stringify(resources ?? []),
      scope ?? "country",
      scope_code ?? null,
    ]
  );
  const row = db.query<LegalItem & { resources: string | null }, [string]>(
    "SELECT * FROM legal_items WHERE id = ?"
  ).get(id);
  return c.json({ ...row, resources: row?.resources ? JSON.parse(row.resources) : [] }, 201);
});
```

- [ ] **Step 3: Replace the PUT handler with a dynamic SET-builder**

Find the existing PUT `/:id/legal/:itemId` handler:

```typescript
// PUT /api/projects/:id/legal/:itemId
router.put("/:id/legal/:itemId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { completed } = await c.req.json();
  db.run("UPDATE legal_items SET completed = ? WHERE id = ? AND project_id = ?",
    [completed ? 1 : 0, c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});
```

Replace with:

```typescript
// PUT /api/projects/:id/legal/:itemId — accepts any subset of editable fields
router.put("/:id/legal/:itemId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const body = await c.req.json();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (body.completed !== undefined) { sets.push("completed = ?"); params.push(body.completed ? 1 : 0); }
  if (body.item !== undefined) { sets.push("item = ?"); params.push(body.item); }
  if (body.priority !== undefined) { sets.push("priority = ?"); params.push(body.priority); }
  if (body.category !== undefined) { sets.push("category = ?"); params.push(body.category); }
  if (body.why !== undefined) { sets.push("why = ?"); params.push(body.why); }
  if (body.action !== undefined) { sets.push("action = ?"); params.push(body.action); }
  if (body.resources !== undefined) { sets.push("resources = ?"); params.push(JSON.stringify(body.resources)); }
  if (body.status_note !== undefined) { sets.push("status_note = ?"); params.push(body.status_note); }

  if (sets.length === 0) return c.json({ ok: true });
  params.push(c.req.param("itemId"), c.req.param("id"));
  db.run(
    `UPDATE legal_items SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`,
    params
  );
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Verify the route file still parses**

```bash
bun -e "import './server/src/routes/projects.ts'; console.log('OK');"
```

Expected output: `OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/projects.ts
git commit -m "feat(legal): extend GET/POST/PUT /legal endpoints for metadata"
```

---

## Task 10: Server — POST /legal/review Endpoint

**Files:**
- Modify: `server/src/routes/projects.ts` (insert before the existing DELETE /legal/:itemId handler at line 427)

- [ ] **Step 1: Add the imports for the LLM review function**

Find the existing import line for the catalog (added in Task 7):

```typescript
import { LEGAL_CATALOG, itemsForCountry, itemsForRegion, isEuMember, type LegalProjectType, type LegalCatalogItem } from "../lib/legal-catalog.ts";
import { enrichSeedItems } from "../lib/legal-llm.ts";
```

Replace the second line with:

```typescript
import { enrichSeedItems, reviewItems, type ReviewedItem } from "../lib/legal-llm.ts";
```

- [ ] **Step 2: Add the new handler before the DELETE legal handler**

Find the DELETE `/:id/legal/:itemId` handler. Immediately BEFORE that handler, insert:

```typescript
// POST /api/projects/:id/legal/review — runs LLM freshness review, returns diff
router.post("/:id/legal/review", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const projectId = c.req.param("id");

  const project = db.query<{ name: string; description: string | null; type: string; stage: string }, [string]>(
    "SELECT name, description, type, stage FROM projects WHERE id = ?"
  ).get(projectId);
  if (!project) return c.json({ error: "Not found" }, 404);

  const projectType: LegalProjectType = project.type === "open-source" ? "open-source" : "for-profit";

  // Load current items
  const rows = db.query<{
    id: string;
    country_code: string;
    item: string;
    priority: string | null;
    category: string | null;
    why: string | null;
    action: string | null;
    scope: string;
    scope_code: string | null;
  }, [string]>(
    `SELECT id, country_code, item, priority, category, why, action, scope, scope_code
     FROM legal_items WHERE project_id = ?`
  ).all(projectId);

  const currentItems: ReviewedItem[] = rows.map(r => ({
    id: r.id,
    country_code: r.country_code,
    scope: (r.scope === "region" ? "region" : "country") as "country" | "region",
    scope_code: r.scope_code,
    item: r.item,
    priority: r.priority as any,
    category: r.category as any,
    why: r.why,
    action: r.action,
  }));

  // Build the catalog snapshot for this project's countries + EU if any EU member is present
  const projectCountries = db.query<{ country_code: string }, [string]>(
    "SELECT DISTINCT country_code FROM project_countries WHERE project_id = ?"
  ).all(projectId).map(r => r.country_code);

  const catalogSnapshot: LegalCatalogItem[] = [];
  for (const cc of projectCountries) {
    catalogSnapshot.push(...itemsForCountry(cc, projectType));
  }
  if (projectCountries.some(isEuMember)) {
    catalogSnapshot.push(...itemsForRegion("eu", projectType));
  }

  try {
    const diff = await reviewItems(
      {
        name: project.name,
        description: project.description,
        type: project.type,
        stage: project.stage,
      },
      currentItems,
      catalogSnapshot
    );
    return c.json(diff);
  } catch (err) {
    return c.json(
      { error: "LLM review unavailable", retryable: true, message: (err as Error).message },
      503
    );
  }
});
```

- [ ] **Step 3: Verify the route file parses**

```bash
bun -e "import './server/src/routes/projects.ts'; console.log('OK');"
```

Expected output: `OK`

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/projects.ts
git commit -m "feat(legal): POST /legal/review endpoint with LLM diff"
```

---

## Task 11: Server — POST /legal/review/apply Endpoint

**Files:**
- Modify: `server/src/routes/projects.ts` (insert immediately after the review handler from Task 10)

- [ ] **Step 1: Add the apply handler immediately after the review handler**

Find the `POST /:id/legal/review` handler from Task 10. Immediately after it (before the DELETE `/legal/:itemId` handler), insert:

```typescript
// POST /api/projects/:id/legal/review/apply — applies an accepted diff in one transaction
router.post("/:id/legal/review/apply", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const projectId = c.req.param("id");
  const body = await c.req.json();

  const stale: { id: string; status_note: string }[] = Array.isArray(body.stale) ? body.stale : [];
  const rename: { id: string; new_item: string }[] = Array.isArray(body.rename) ? body.rename : [];
  const missing: any[] = Array.isArray(body.missing) ? body.missing : [];
  const removed: string[] = Array.isArray(body.removed) ? body.removed : [];

  const now = Date.now();
  let applied = 0;

  // bun:sqlite supports synchronous transactions via db.transaction(...)
  const tx = db.transaction(() => {
    for (const s of stale) {
      if (typeof s.id !== "string" || typeof s.status_note !== "string") continue;
      db.run(
        "UPDATE legal_items SET status_note = ?, last_reviewed_at = ? WHERE id = ? AND project_id = ?",
        [s.status_note, now, s.id, projectId]
      );
      applied++;
    }
    for (const r of rename) {
      if (typeof r.id !== "string" || typeof r.new_item !== "string") continue;
      db.run(
        "UPDATE legal_items SET item = ?, last_reviewed_at = ? WHERE id = ? AND project_id = ?",
        [r.new_item, now, r.id, projectId]
      );
      applied++;
    }
    for (const m of missing) {
      if (typeof m.item !== "string" || typeof m.country_code !== "string") continue;
      db.run(
        `INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at,
          priority, category, why, action, resources, scope, scope_code, last_reviewed_at, status_note)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          crypto.randomUUID(),
          projectId,
          m.country_code,
          m.item,
          now,
          m.priority ?? null,
          m.category ?? null,
          m.why ?? null,
          m.action ?? null,
          JSON.stringify(m.resources ?? []),
          m.scope ?? "country",
          m.scope_code ?? null,
          now,
        ]
      );
      applied++;
    }
    for (const id of removed) {
      if (typeof id !== "string") continue;
      db.run("DELETE FROM legal_items WHERE id = ? AND project_id = ?", [id, projectId]);
      applied++;
    }
  });
  tx();

  return c.json({ applied });
});
```

- [ ] **Step 2: Verify the route file parses**

```bash
bun -e "import './server/src/routes/projects.ts'; console.log('OK');"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/projects.ts
git commit -m "feat(legal): POST /legal/review/apply transactional handler"
```

---

## Task 12: Server — One-Time EU Cleanup Startup Migration

**Files:**
- Modify: `server/src/db/index.ts` (append at the bottom)

- [ ] **Step 1: Add the EU cleanup migration**

Open `server/src/db/index.ts`. After all the `CREATE INDEX` statements at the bottom of the file (the last line currently being `db.run("CREATE INDEX IF NOT EXISTS idx_news_items_source_id ON news_items(source_id)");`), append:

```typescript
// One-time cleanup: convert legacy "EU" country entries to scope='region'/scope_code='eu'.
// Idempotent — re-running does nothing on already-migrated databases.
try {
  // Step 1: For projects that have an "EU" entry in project_countries, convert their EU legal items
  // to the new region-scoped shape.
  db.run(
    `UPDATE legal_items
     SET scope = 'region', scope_code = 'eu', country_code = ''
     WHERE country_code = 'EU' AND scope = 'country'`
  );

  // Step 2: Mark migrated EU items where the project has no EU member countries with a status note.
  // (Hard to express in SQL alone; we do this in JS for clarity.)
  const orphans = db.query<{ project_id: string }, []>(
    `SELECT DISTINCT li.project_id FROM legal_items li
     WHERE li.scope = 'region' AND li.scope_code = 'eu' AND li.status_note IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM project_countries pc
         WHERE pc.project_id = li.project_id
           AND pc.country_code IN ('AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE')
       )`
  ).all();
  for (const o of orphans) {
    db.run(
      `UPDATE legal_items
       SET status_note = ?
       WHERE project_id = ? AND scope = 'region' AND scope_code = 'eu' AND status_note IS NULL`,
      [
        "EU items present without an EU member country selected. Add a member country or delete these items if no longer relevant.",
        o.project_id,
      ]
    );
  }

  // Step 3: Remove the bogus "EU" rows from project_countries.
  db.run(`DELETE FROM project_countries WHERE country_code = 'EU'`);
} catch (e) {
  console.warn("[db] EU cleanup migration error (likely benign on fresh DB):", (e as Error).message);
}
```

- [ ] **Step 2: Verify the migration runs without errors**

```bash
bun -e "import { db } from './server/src/db/index.ts'; const left = db.query('SELECT count(*) as c FROM project_countries WHERE country_code = \\'EU\\'').get(); console.log('legacy EU rows remaining:', left.c);"
```

Expected output: `legacy EU rows remaining: 0`

- [ ] **Step 3: Commit**

```bash
git add server/src/db/index.ts
git commit -m "feat(db): one-time EU cleanup migration (legacy EU country -> region scope)"
```

---

## Task 13: Client Types — Extend `LegalItem` and Add Diff Types

**Files:**
- Modify: `client/src/lib/types.ts:44-51`

- [ ] **Step 1: Add LegalPriority/LegalCategory types and extend LegalItem**

Find the existing `LegalItem` interface in `client/src/lib/types.ts`:

```typescript
export interface LegalItem {
  id: string;
  project_id: string;
  country_code: string;
  item: string;
  completed: 0 | 1;
  created_at: number;
}
```

Replace with:

```typescript
export type LegalPriority = "blocker" | "important" | "recommended";
export type LegalCategory = "privacy" | "tax" | "terms" | "ip" | "accessibility" | "data" | "corporate";

export interface LegalResource {
  label: string;
  url: string;
}

export interface LegalItem {
  id: string;
  project_id: string;
  country_code: string;             // empty string for region items (EU); UI keys off scope/scope_code
  item: string;
  completed: 0 | 1;
  created_at: number;
  // new fields (nullable for legacy backward compat):
  priority: LegalPriority | null;
  category: LegalCategory | null;
  why: string | null;
  action: string | null;
  resources: LegalResource[];        // empty array if none; server parses JSON before send
  scope: "country" | "region";
  scope_code: string | null;         // "eu" for region items
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
```

- [ ] **Step 2: Verify the client builds**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms` — there may be type errors in `ProjectDetail.tsx` that consume `LegalItem`; those will be fixed in subsequent tasks. If the build genuinely fails, check the output and fix obvious type mismatches in any consumer that destructures fields not yet present.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/types.ts
git commit -m "feat(legal): extend client LegalItem with metadata + add LegalReviewDiff"
```

---

## Task 14: Client API — Extend `legal` Namespace + Review Methods

**Files:**
- Modify: `client/src/lib/api.ts:1` (imports), `:126-134` (legal namespace)

- [ ] **Step 1: Add new types to imports**

Find the type import line at the top of `client/src/lib/api.ts`:

```typescript
import type { User, Project, ProjectLink, LaunchChecklistItem, ChecklistCategory, TechDebtItem, TechDebtSeverity, TechDebtCategory, TechDebtEffort, MrrEntry, Goal, ProjectStage, ProjectType, DashboardData, ProjectCountry, LegalItem, Note, Idea, FileRecord, DailySummary, LLMHealth, NewsItem, NewsSource, WhisperHealth, VoiceIdeaResult, GitHubRepoData, GitHubActivity } from "./types";
```

Replace with:

```typescript
import type { User, Project, ProjectLink, LaunchChecklistItem, ChecklistCategory, TechDebtItem, TechDebtSeverity, TechDebtCategory, TechDebtEffort, MrrEntry, Goal, ProjectStage, ProjectType, DashboardData, ProjectCountry, LegalItem, LegalPriority, LegalCategory, LegalResource, LegalReviewDiff, LegalReviewMissingItem, Note, Idea, FileRecord, DailySummary, LLMHealth, NewsItem, NewsSource, WhisperHealth, VoiceIdeaResult, GitHubRepoData, GitHubActivity } from "./types";
```

- [ ] **Step 2: Replace the legal namespace**

Find the existing `legal` namespace (around line 126-134):

```typescript
    legal: {
      list: (id: string) => req<LegalItem[]>(`/projects/${id}/legal`),
      create: (id: string, data: { country_code: string; item: string }) =>
        req<LegalItem>(`/projects/${id}/legal`, { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, itemId: string, completed: boolean) =>
        req<{ ok: true }>(`/projects/${id}/legal/${itemId}`, { method: "PUT", body: JSON.stringify({ completed }) }),
      delete: (id: string, itemId: string) =>
        req<{ ok: true }>(`/projects/${id}/legal/${itemId}`, { method: "DELETE" }),
    },
```

Replace with:

```typescript
    legal: {
      list: (id: string) => req<LegalItem[]>(`/projects/${id}/legal`),
      create: (id: string, data: {
        country_code: string;
        item: string;
        priority?: LegalPriority;
        category?: LegalCategory;
        why?: string;
        action?: string;
        resources?: LegalResource[];
        scope?: "country" | "region";
        scope_code?: string | null;
      }) =>
        req<LegalItem>(`/projects/${id}/legal`, { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, itemId: string, data: {
        completed?: boolean;
        item?: string;
        priority?: LegalPriority;
        category?: LegalCategory;
        why?: string;
        action?: string;
        resources?: LegalResource[];
        status_note?: string | null;
      }) =>
        req<{ ok: true }>(`/projects/${id}/legal/${itemId}`, { method: "PUT", body: JSON.stringify(data) }),
      delete: (id: string, itemId: string) =>
        req<{ ok: true }>(`/projects/${id}/legal/${itemId}`, { method: "DELETE" }),
      review: (id: string) =>
        req<LegalReviewDiff>(`/projects/${id}/legal/review`, { method: "POST", body: JSON.stringify({}) }),
      applyReview: (id: string, diff: {
        stale: { id: string; status_note: string }[];
        rename: { id: string; new_item: string }[];
        missing: LegalReviewMissingItem[];
        removed: string[];
      }) =>
        req<{ applied: number }>(`/projects/${id}/legal/review/apply`, { method: "POST", body: JSON.stringify(diff) }),
    },
```

- [ ] **Step 3: Verify the client builds**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`. There will still be call-site type errors in ProjectDetail.tsx — that's expected, fixed in Tasks 16-21.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/api.ts
git commit -m "feat(legal): extend api.legal with metadata + review/applyReview methods"
```

---

## Task 15: Client — Remove EU from Country Selector

**Files:**
- Modify: `client/src/lib/countries.ts:1-15`

- [ ] **Step 1: Drop the EU entry**

Find the `COUNTRIES` array:

```typescript
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "EU", name: "European Union" },
  { code: "US", name: "United States" },
  // ... rest ...
];
```

Replace with (drop the EU line):

```typescript
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "UK", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "JP", name: "Japan" },
  { code: "SG", name: "Singapore" },
  { code: "RU", name: "Russia" },
];
```

Keep the `countryFlag` function unchanged — it still needs to render 🇪🇺 for the auto-attached EU section.

Add a helper that the UI can use for EU member detection:

```typescript
export const EU_MEMBER_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

export function isEuMemberCountry(code: string): boolean {
  return EU_MEMBER_CODES.includes(code);
}
```

(Append these at the bottom of the file.)

- [ ] **Step 2: Verify the client builds**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/countries.ts
git commit -m "feat(legal): remove EU from country selector, add EU member helper"
```

---

## Task 16: Client UI — Filter Bar + Per-Scope Cards Rework

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx` (LegalTab function)

- [ ] **Step 1: Find the `LegalTab` function** (around line 728)

It starts with: `function LegalTab({ project, queryClient }: { project: Project; queryClient: ReturnType<typeof useQueryClient> }) {`

- [ ] **Step 2: Add filter state at the top of the function**

Right after the existing `useState` declarations (around `const [showCustomForm, setShowCustomForm] = useState<Record<string, boolean>>({});`), add:

```typescript
const [filterPriority, setFilterPriority] = useState<"all" | "blocker" | "important" | "recommended">("all");
const [filterCategory, setFilterCategory] = useState<"all" | "privacy" | "tax" | "terms" | "ip" | "accessibility" | "data" | "corporate">("all");
const [filterStatus, setFilterStatus] = useState<"all" | "open" | "done" | "needs-review">("all");
```

- [ ] **Step 3: Import isEuMemberCountry**

Find the existing import line for `countries.ts` near the top of the file:

```typescript
import { COUNTRIES, countryFlag } from "@/lib/countries";
```

Replace with:

```typescript
import { COUNTRIES, countryFlag, isEuMemberCountry } from "@/lib/countries";
```

- [ ] **Step 4: Add a derived filtered-items helper inside LegalTab**

After the `itemsByCountry` declaration in `LegalTab`, replace the existing grouping logic:

```typescript
// Group legal items by country_code
const itemsByCountry: Record<string, LegalItem[]> = {};
for (const item of legalItems) {
  if (!itemsByCountry[item.country_code]) itemsByCountry[item.country_code] = [];
  itemsByCountry[item.country_code].push(item);
}
```

Replace with:

```typescript
// Apply filters
const passesFilter = (item: LegalItem): boolean => {
  if (filterPriority !== "all" && (item.priority ?? "recommended") !== filterPriority) return false;
  if (filterCategory !== "all" && (item.category ?? "terms") !== filterCategory) return false;
  if (filterStatus === "open" && item.completed === 1) return false;
  if (filterStatus === "done" && item.completed === 0) return false;
  if (filterStatus === "needs-review" && !item.status_note) return false;
  return true;
};
const filteredItems = legalItems.filter(passesFilter);

// Group by scope: country items by country_code, region items under their scope_code
const itemsByScope: Record<string, LegalItem[]> = {};
for (const item of filteredItems) {
  const key = item.scope === "region" ? `region:${item.scope_code ?? "unknown"}` : item.country_code;
  if (!itemsByScope[key]) itemsByScope[key] = [];
  itemsByScope[key].push(item);
}

// Show EU section if any EU member country is active
const hasEuMember = countries.some((c: ProjectCountry) => isEuMemberCountry(c.country_code));
```

- [ ] **Step 5: Add the filter bar JSX above the per-scope cards**

Find the JSX block that starts with `{/* Per-country legal cards */}` (around line 848) and the `{countries.map(...)}` block immediately after it. Insert this filter bar BEFORE the country chips block:

```tsx
{/* Filter bar */}
{legalItems.length > 0 && (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as typeof filterPriority)}>
          <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="blocker">Blocker</SelectItem>
            <SelectItem value="important">Important</SelectItem>
            <SelectItem value="recommended">Recommended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as typeof filterCategory)}>
          <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="privacy">Privacy</SelectItem>
            <SelectItem value="tax">Tax</SelectItem>
            <SelectItem value="terms">Terms</SelectItem>
            <SelectItem value="ip">IP</SelectItem>
            <SelectItem value="accessibility">Accessibility</SelectItem>
            <SelectItem value="data">Data</SelectItem>
            <SelectItem value="corporate">Corporate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
          <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="needs-review">Needs review</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 6: Update the country card iteration to use itemsByScope and include EU**

Find the `{countries.map((c: ProjectCountry) => { ... })}` block. Replace the entire block with:

```tsx
{/* Per-scope legal cards */}
{countries.map((c: ProjectCountry) => {
  const items = itemsByScope[c.country_code] ?? [];
  const allItemsForCountry = legalItems.filter(li => li.scope === "country" && li.country_code === c.country_code);
  const done = allItemsForCountry.filter(i => i.completed === 1).length;
  const total = allItemsForCountry.length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <LegalScopeCard
      key={c.id}
      title={`${countryFlag(c.country_code)} ${c.country_name}`}
      items={items}
      done={done}
      total={total}
      pct={pct}
      scopeCode={c.country_code}
      isRegion={false}
      onToggle={(itemId, completed) => toggleLegal.mutate({ itemId, completed })}
      onDelete={(itemId) => deleteLegal.mutate(itemId)}
      onAddCustom={(item, priority, category) => addLegalItem.mutate({ country_code: c.country_code, item, priority, category })}
    />
  );
})}

{/* EU region section (auto-attached when any EU member is present) */}
{hasEuMember && (() => {
  const items = itemsByScope["region:eu"] ?? [];
  const allEuItems = legalItems.filter(li => li.scope === "region" && li.scope_code === "eu");
  const done = allEuItems.filter(i => i.completed === 1).length;
  const total = allEuItems.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <LegalScopeCard
      key="eu-region"
      title={`${countryFlag("EU")} European Union`}
      items={items}
      done={done}
      total={total}
      pct={pct}
      scopeCode="eu"
      isRegion={true}
      onToggle={(itemId, completed) => toggleLegal.mutate({ itemId, completed })}
      onDelete={(itemId) => deleteLegal.mutate(itemId)}
      onAddCustom={(item, priority, category) => addLegalItem.mutate({ country_code: "", item, priority, category, scope: "region", scope_code: "eu" })}
    />
  );
})()}
```

The `LegalScopeCard` component is defined in Task 17 (next task). Until that task is committed, the build will fail with "LegalScopeCard not defined" — that is expected. Tasks 16 and 17 are committed together.

- [ ] **Step 7: Update mutation signatures to match new types**

Find the existing `addLegalItem` mutation:

```typescript
const addLegalItem = useMutation({
  mutationFn: (data: { country_code: string; item: string }) =>
    api.projects.legal.create(id, data),
```

Replace with:

```typescript
const addLegalItem = useMutation({
  mutationFn: (data: {
    country_code: string;
    item: string;
    priority?: import("@/lib/types").LegalPriority;
    category?: import("@/lib/types").LegalCategory;
    scope?: "country" | "region";
    scope_code?: string | null;
  }) => api.projects.legal.create(id, data),
```

Find the existing `toggleLegal` mutation:

```typescript
const toggleLegal = useMutation({
  mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
    api.projects.legal.update(id, itemId, completed),
```

Replace with:

```typescript
const toggleLegal = useMutation({
  mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
    api.projects.legal.update(id, itemId, { completed }),
```

(The signature change in `api.legal.update` from positional `completed` to `data: { completed }` was made in Task 14.)

- [ ] **Step 8: Do not commit yet — Task 17 must land first.**

Task 16 leaves the build broken (references undefined `LegalScopeCard`). Tasks 16 and 17 are committed together as a paired commit (same pattern as Tasks 5+6 and 11+12 in the previous A1+A2 plan).

---

## Task 17: Client UI — `LegalScopeCard` Rich Item Row Component

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx` (insert `LegalScopeCard` function above `LegalTab` or below it — convention: helper components defined before consumers, so insert BEFORE `LegalTab`)

- [ ] **Step 1: Insert the `LegalScopeCard` component**

Find the line that begins `function LegalTab({ project, queryClient }` (around line 728). Immediately BEFORE that line, insert:

```typescript
const PRIORITY_BADGE: Record<string, string> = {
  blocker: "bg-destructive/10 text-destructive border-destructive/30",
  important: "bg-warning/10 text-warning border-warning/30",
  recommended: "bg-muted text-muted-foreground border-border",
};

const CATEGORY_LABEL: Record<string, string> = {
  privacy: "Privacy",
  tax: "Tax",
  terms: "Terms",
  ip: "IP",
  accessibility: "Accessibility",
  data: "Data",
  corporate: "Corporate",
};

function LegalScopeCard({
  title,
  items,
  done,
  total,
  pct,
  scopeCode,
  isRegion,
  onToggle,
  onDelete,
  onAddCustom,
}: {
  title: string;
  items: LegalItem[];
  done: number;
  total: number;
  pct: number;
  scopeCode: string;
  isRegion: boolean;
  onToggle: (itemId: string, completed: boolean) => void;
  onDelete: (itemId: string) => void;
  onAddCustom: (item: string, priority: import("@/lib/types").LegalPriority, category: import("@/lib/types").LegalCategory) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, { why: boolean; action: boolean }>>({});
  const [customInput, setCustomInput] = useState("");
  const [customPriority, setCustomPriority] = useState<import("@/lib/types").LegalPriority>("recommended");
  const [customCategory, setCustomCategory] = useState<import("@/lib/types").LegalCategory>("terms");
  const [showCustomForm, setShowCustomForm] = useState(false);

  const toggleExpanded = (id: string, field: "why" | "action") => {
    setExpanded(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: !prev[id]?.[field] },
    }));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <span className="text-xs text-muted-foreground">{done}/{total}</span>
        </div>
        <Progress value={pct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No items match the current filters.</p>
        )}
        {items.map((item: LegalItem) => {
          const priority = item.priority ?? "recommended";
          const category = item.category ?? "terms";
          const priorityClass = PRIORITY_BADGE[priority];
          const isExpanded = expanded[item.id] ?? { why: false, action: false };

          return (
            <div key={item.id} className={cn(
              "flex items-start gap-3 p-4 rounded-md border",
              item.completed === 1 ? "border-border/40 bg-card/50" : "border-border"
            )}>
              <Checkbox
                id={`legal-${item.id}`}
                checked={item.completed === 1}
                onCheckedChange={(v) => onToggle(item.id, !!v)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <label
                    htmlFor={`legal-${item.id}`}
                    className={cn(
                      "text-sm leading-snug flex-1 cursor-pointer",
                      item.completed === 1 && "line-through text-muted-foreground"
                    )}
                  >
                    {item.item}
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className={cn("text-[11px] px-2.5 py-1 rounded border font-medium leading-none", priorityClass)}>
                    {priority}
                  </span>
                  <span className="text-[11px] px-2.5 py-1 rounded border border-border text-muted-foreground leading-none">
                    {CATEGORY_LABEL[category]}
                  </span>
                  {item.status_note && (
                    <span
                      title={item.status_note}
                      className="inline-flex items-center gap-1 text-[11px] text-warning"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                      needs review
                    </span>
                  )}
                </div>
                {item.why && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.id, "why")}
                      className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      {isExpanded.why ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      Why this matters
                    </button>
                    {isExpanded.why && (
                      <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{item.why}</p>
                    )}
                  </div>
                )}
                {item.action && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.id, "action")}
                      className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      {isExpanded.action ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      Action
                    </button>
                    {isExpanded.action && (
                      <p className="text-xs leading-relaxed mt-1.5">{item.action}</p>
                    )}
                  </div>
                )}
                {item.resources && item.resources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.resources.map((r, i) => (
                      <a
                        key={i}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors inline-flex items-center gap-1"
                      >
                        {r.label}
                        <ExternalLink size={9} />
                      </a>
                    ))}
                  </div>
                )}
                {item.status_note && (
                  <p className="text-[11px] text-warning bg-warning/5 border border-warning/20 rounded p-2 leading-relaxed">
                    {item.status_note}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => onDelete(item.id)}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          );
        })}

        {/* Add custom item form */}
        {showCustomForm ? (
          <div className="space-y-2 p-3 border border-dashed border-border rounded-md">
            <Input
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              placeholder="Custom legal item..."
              className="text-sm h-9"
              autoFocus
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={customPriority} onValueChange={(v) => setCustomPriority(v as import("@/lib/types").LegalPriority)}>
                <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blocker">Blocker</SelectItem>
                  <SelectItem value="important">Important</SelectItem>
                  <SelectItem value="recommended">Recommended</SelectItem>
                </SelectContent>
              </Select>
              <Select value={customCategory} onValueChange={(v) => setCustomCategory(v as import("@/lib/types").LegalCategory)}>
                <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="privacy">Privacy</SelectItem>
                  <SelectItem value="tax">Tax</SelectItem>
                  <SelectItem value="terms">Terms</SelectItem>
                  <SelectItem value="ip">IP</SelectItem>
                  <SelectItem value="accessibility">Accessibility</SelectItem>
                  <SelectItem value="data">Data</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!customInput.trim()}
                onClick={() => {
                  onAddCustom(customInput.trim(), customPriority, customCategory);
                  setCustomInput("");
                  setShowCustomForm(false);
                }}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setShowCustomForm(false); setCustomInput(""); }}
              >
                <X size={13} />
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCustomForm(true)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full pt-1"
          >
            <Plus size={11} />
            Add custom item
          </button>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add the `ChevronDown`, `ChevronRight`, `ExternalLink` imports**

Find the existing lucide-react import at the top of `client/src/pages/ProjectDetail.tsx`. It currently imports a list of icons. Add `ChevronDown`, `ChevronRight`, `ExternalLink` to that list. (If they're already imported, no change needed — quick grep first.)

```bash
grep -n "ChevronDown\|ChevronRight\|ExternalLink" /Users/glebstarcikov/Launchpad/client/src/pages/ProjectDetail.tsx | head -5
```

If any are missing from the import line, add them. Example: if the import currently looks like `import { Plus, Trash2, X, RefreshCw, ... } from "lucide-react";`, append the missing ones: `import { Plus, Trash2, X, RefreshCw, ..., ChevronDown, ChevronRight, ExternalLink } from "lucide-react";`.

- [ ] **Step 3: Verify the client builds**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`.

- [ ] **Step 4: Commit Tasks 16 and 17 together**

```bash
git add client/src/pages/ProjectDetail.tsx
git commit -m "feat(legal): filter bar + per-scope cards"
git commit --allow-empty -m "feat(legal): rich LegalScopeCard with collapsible Why/Action/Resources"
```

Note: the second commit is empty because both Tasks 16 and 17 modify the same file in one combined edit. We use `--allow-empty` here only as a marker so git history maps cleanly to plan tasks. **If you'd prefer a single commit**, drop the second line and just commit once with a combined message:

```bash
git commit -m "feat(legal): filter bar + per-scope cards + rich LegalScopeCard"
```

(Recommend the single-commit approach to keep history cleaner. The plan calls them out as separate tasks for review/clarity, but one commit is fine.)

---

## Task 18: Client UI — Auto-Attached EU Chip in Active Country Chips

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx` (the active country chips JSX inside `LegalTab`)

- [ ] **Step 1: Find the active country chips block**

Search for `{/* Active country chips */}` (around line 832). The current JSX renders one chip per country with an X button to remove it.

- [ ] **Step 2: Add a non-removable EU chip when any EU member is present**

Replace the existing block:

```tsx
{/* Active country chips */}
{countries.length > 0 && (
  <div className="flex flex-wrap gap-2">
    {countries.map((c: ProjectCountry) => (
      <Badge key={c.id} variant="secondary" className="gap-1.5 pl-2 pr-1 py-1">
        {countryFlag(c.country_code)} {c.country_name}
        <button
          onClick={() => removeCountry.mutate(c.id)}
          className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
        >
          <X size={12} />
        </button>
      </Badge>
    ))}
  </div>
)}
```

With:

```tsx
{/* Active country chips + auto EU chip */}
{(countries.length > 0 || hasEuMember) && (
  <div className="flex flex-wrap gap-2">
    {countries.map((c: ProjectCountry) => (
      <Badge key={c.id} variant="secondary" className="gap-1.5 pl-2 pr-1 py-1">
        {countryFlag(c.country_code)} {c.country_name}
        <button
          onClick={() => removeCountry.mutate(c.id)}
          className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
        >
          <X size={12} />
        </button>
      </Badge>
    ))}
    {hasEuMember && (
      <Badge
        variant="outline"
        className="gap-1.5 px-2 py-1 border-dashed text-muted-foreground"
        title="Removed automatically when no EU member countries remain."
      >
        {countryFlag("EU")} European Union
      </Badge>
    )}
  </div>
)}
```

- [ ] **Step 3: Verify the client builds**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ProjectDetail.tsx
git commit -m "feat(legal): auto-attached EU chip in active country chips"
```

---

## Task 19: Client UI — Review Compliance Modal

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx` (add a `LegalReviewModal` component + a button + state in `LegalTab`)

- [ ] **Step 1: Add `LegalReviewModal` component above `LegalTab`**

Insert above the `LegalScopeCard` definition (added in Task 17):

```typescript
function LegalReviewModal({
  diff,
  isLoading,
  error,
  onClose,
  onApply,
  onRetry,
}: {
  diff: import("@/lib/types").LegalReviewDiff | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onApply: (accepted: {
    stale: { id: string; status_note: string }[];
    rename: { id: string; new_item: string }[];
    missing: import("@/lib/types").LegalReviewMissingItem[];
    removed: string[];
  }) => void;
  onRetry: () => void;
}) {
  const [acceptedStale, setAcceptedStale] = useState<Set<number>>(new Set());
  const [acceptedRename, setAcceptedRename] = useState<Set<number>>(new Set());
  const [acceptedMissing, setAcceptedMissing] = useState<Set<number>>(new Set());
  const [acceptedRemoved, setAcceptedRemoved] = useState<Set<number>>(new Set());
  const [allowRemovals, setAllowRemovals] = useState(false);
  const [showOk, setShowOk] = useState(false);

  const toggle = (set: Set<number>, setSet: (s: Set<number>) => void, idx: number) => {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSet(next);
  };

  const totalAccepted = acceptedStale.size + acceptedRename.size + acceptedMissing.size + acceptedRemoved.size;

  const handleApply = () => {
    if (!diff) return;
    onApply({
      stale: [...acceptedStale].map(i => diff.stale[i]),
      rename: [...acceptedRename].map(i => diff.rename[i]),
      missing: [...acceptedMissing].map(i => diff.missing[i]),
      removed: [...acceptedRemoved].map(i => diff.removed[i]),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold">Review Compliance</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Reviewing compliance items with LLM... this may take 5-15 seconds.
            </p>
          )}

          {error && (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-destructive">Review failed: {error}</p>
              <Button onClick={onRetry} size="sm">Retry</Button>
            </div>
          )}

          {diff && !isLoading && !error && (
            <>
              {/* Stale items */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Stale ({diff.stale.length})
                </h3>
                {diff.stale.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No stale items.</p>
                ) : (
                  <div className="space-y-1.5">
                    {diff.stale.map((s, idx) => (
                      <label key={idx} className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-secondary/30">
                        <Checkbox checked={acceptedStale.has(idx)} onCheckedChange={() => toggle(acceptedStale, setAcceptedStale, idx)} className="mt-1" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">id: {s.id.slice(0, 8)}…</p>
                          <p className="text-sm text-warning leading-snug mt-0.5">{s.status_note}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Renamed items */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Renamed ({diff.rename.length})
                </h3>
                {diff.rename.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No renamed items.</p>
                ) : (
                  <div className="space-y-1.5">
                    {diff.rename.map((r, idx) => (
                      <label key={idx} className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-secondary/30">
                        <Checkbox checked={acceptedRename.has(idx)} onCheckedChange={() => toggle(acceptedRename, setAcceptedRename, idx)} className="mt-1" />
                        <div className="flex-1 min-w-0 text-sm">
                          <p className="text-muted-foreground line-through">{r.id.slice(0, 8)}…</p>
                          <p>→ {r.new_item}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Missing items */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Missing ({diff.missing.length})
                </h3>
                {diff.missing.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No missing items.</p>
                ) : (
                  <div className="space-y-1.5">
                    {diff.missing.map((m, idx) => (
                      <label key={idx} className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-secondary/30">
                        <Checkbox checked={acceptedMissing.has(idx)} onCheckedChange={() => toggle(acceptedMissing, setAcceptedMissing, idx)} className="mt-1" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{m.item}</p>
                          <div className="flex gap-2 mt-1 text-[10px]">
                            <span className="text-muted-foreground">{m.scope === "region" ? "🇪🇺 EU" : m.country_code}</span>
                            <span className="text-muted-foreground">{m.priority}</span>
                            <span className="text-muted-foreground">{m.category}</span>
                          </div>
                          {m.why && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.why}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Removed items (gated) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Removed ({diff.removed.length})
                  </h3>
                  {diff.removed.length > 0 && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox checked={allowRemovals} onCheckedChange={(v) => setAllowRemovals(!!v)} />
                      Allow removals
                    </label>
                  )}
                </div>
                {diff.removed.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No removals suggested.</p>
                ) : (
                  <div className="space-y-1.5">
                    {diff.removed.map((id, idx) => (
                      <label
                        key={idx}
                        className={cn(
                          "flex items-start gap-2 p-2 rounded border border-border",
                          allowRemovals ? "cursor-pointer hover:bg-secondary/30" : "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <Checkbox
                          checked={acceptedRemoved.has(idx)}
                          disabled={!allowRemovals}
                          onCheckedChange={() => allowRemovals && toggle(acceptedRemoved, setAcceptedRemoved, idx)}
                          className="mt-1"
                        />
                        <p className="text-sm text-muted-foreground">id: {id.slice(0, 8)}…</p>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* OK items collapsed */}
              <div>
                <button
                  className="text-xs uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground"
                  onClick={() => setShowOk(s => !s)}
                >
                  OK ({diff.ok.length}) — {showOk ? "hide" : "show"}
                </button>
                {showOk && diff.ok.length > 0 && (
                  <div className="mt-2 space-y-0.5 max-h-40 overflow-auto">
                    {diff.ok.map((id, idx) => (
                      <p key={idx} className="text-[11px] text-muted-foreground font-mono">{id}</p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{totalAccepted} change{totalAccepted === 1 ? "" : "s"} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={totalAccepted === 0 || isLoading || !!error} onClick={handleApply}>
              Apply {totalAccepted} change{totalAccepted === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add review state and mutations to `LegalTab`**

Inside `LegalTab`, after the existing mutations (around the `deleteLegal` mutation), add:

```typescript
const [showReview, setShowReview] = useState(false);
const [reviewDiff, setReviewDiff] = useState<import("@/lib/types").LegalReviewDiff | null>(null);
const [reviewError, setReviewError] = useState<string | null>(null);

const reviewMutation = useMutation({
  mutationFn: () => api.projects.legal.review(id),
  onSuccess: (diff) => {
    setReviewDiff(diff);
    setReviewError(null);
  },
  onError: (err: any) => {
    setReviewError(err?.message ?? "Review failed");
  },
});

const applyReviewMutation = useMutation({
  mutationFn: (accepted: {
    stale: { id: string; status_note: string }[];
    rename: { id: string; new_item: string }[];
    missing: import("@/lib/types").LegalReviewMissingItem[];
    removed: string[];
  }) => api.projects.legal.applyReview(id, accepted),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["legal", id] });
    setShowReview(false);
    setReviewDiff(null);
  },
});

const handleOpenReview = () => {
  setShowReview(true);
  setReviewDiff(null);
  setReviewError(null);
  reviewMutation.mutate();
};
```

- [ ] **Step 3: Add the "Review compliance" button**

Find the `Add Country / Region` Card header. Replace its CardHeader+CardContent with:

```tsx
<CardHeader className="pb-3">
  <div className="flex items-center justify-between">
    <CardTitle className="text-sm font-medium">Add Country / Region</CardTitle>
    {legalItems.length > 0 && (
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={handleOpenReview}
        disabled={reviewMutation.isPending}
      >
        <RefreshCw size={12} className={cn("mr-1.5", reviewMutation.isPending && "animate-spin")} />
        Review compliance
      </Button>
    )}
  </div>
</CardHeader>
```

- [ ] **Step 4: Render the modal at the bottom of `LegalTab`'s return JSX**

Find the closing `</div>` of `LegalTab`'s outermost `<div className="space-y-4">`. Just before that closing `</div>`, add:

```tsx
{showReview && (
  <LegalReviewModal
    diff={reviewDiff}
    isLoading={reviewMutation.isPending}
    error={reviewError}
    onClose={() => setShowReview(false)}
    onApply={(accepted) => applyReviewMutation.mutate(accepted)}
    onRetry={() => { setReviewError(null); reviewMutation.mutate(); }}
  />
)}
```

- [ ] **Step 5: Verify the client builds**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ProjectDetail.tsx
git commit -m "feat(legal): Review Compliance modal with tabbed diff + gated removals"
```

---

## Task 20: Client UI — Disclaimer Banner

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx` (top of `LegalTab` return JSX)

- [ ] **Step 1: Add the disclaimer banner**

Find the opening `<div className="space-y-4">` at the start of `LegalTab`'s return JSX. Immediately after it (as the first child), add:

```tsx
<div className="text-[11px] text-muted-foreground bg-warning/5 border border-warning/20 rounded p-2.5 leading-relaxed">
  ⚠️ <span className="font-medium text-warning">Compliance suggestions, not legal advice.</span> This list is curated from public sources and personalized by an AI. Consult a lawyer before launching in regulated industries.
</div>
```

- [ ] **Step 2: Verify the client builds**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ProjectDetail.tsx
git commit -m "feat(legal): persistent disclaimer banner above Legal tab content"
```

---

## Task 21: Manual Verification Pass

**Files:** none (browser + DB inspection only)

- [ ] **Step 1: Restart the dev server cleanly**

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null
cd /Users/glebstarcikov/Launchpad && bun run dev > /tmp/launchpad-dev.log 2>&1 &
sleep 3
curl -s http://localhost:3001/api/health/llm | head
```

- [ ] **Step 2: Verify EU is gone from the country selector**

Open the app in a browser. Create a new for-profit project (e.g., "Test SaaS") with a description that mentions a tech stack ("uses PostHog and Supabase"). Go to the Legal tab. Click the country selector — verify "European Union" is NOT in the dropdown. The dropdown should show 12 entries (US, UK, CA, AU, DE, FR, NL, IN, BR, JP, SG, RU).

- [ ] **Step 3: Add a non-EU country first (e.g., US)**

Add the US. Verify:
- A US card appears with rich items (priority badges, category badges)
- Items have collapsible Why and Action sections
- Resources appear as clickable badge-style links
- The disclaimer banner is visible at the top
- No EU section appears (US is not an EU member)
- The "Review compliance" button appears in the header

- [ ] **Step 4: Add Germany (an EU member)**

Add DE. Verify:
- A Germany card appears with country-specific items (Impressum, BDSG, TTDSG)
- An "🇪🇺 European Union" card appears with EU-region items (GDPR Privacy Policy, Cookie Consent, etc.)
- An "🇪🇺 European Union" chip appears in the active chips row, styled with a dashed border (non-removable)
- Item action text is personalized to mention PostHog/Supabase if the LLM is available

If the LLM is unavailable: items still seed with generic action text and the dev log shows the fallback warning. That's fine.

- [ ] **Step 5: Add France (another EU member)**

Add FR. Verify:
- A France card appears with country-specific items (CNIL, Toubon Law)
- The EU section is NOT duplicated (it was already attached when DE was added)
- The active chip row still shows one EU chip

- [ ] **Step 6: Remove Germany (EU members still exist via FR)**

Click the X on the Germany chip. Verify:
- The Germany card disappears
- The EU section remains (FR is still an EU member)

- [ ] **Step 7: Remove France (last EU member)**

Click the X on the France chip. Verify:
- The France card disappears
- The EU section disappears
- The EU chip disappears
- DB check: `bun -e "import { db } from './server/src/db/index.ts'; const eu = db.query('SELECT count(*) as c FROM legal_items WHERE scope = \\'region\\' AND scope_code = \\'eu\\' AND project_id = ?').get('<your-project-id>'); console.log('EU items remaining:', eu.c);"` should print `EU items remaining: 0`.

- [ ] **Step 8: Add Russia and verify extensive coverage**

Add RU. Verify:
- A Russia card appears with ~15 items
- Several items are tagged `blocker` priority (red badge): privacy policy, RKN registration, data localization, cross-border, explicit consent, tax entity registration
- Resources include `pd.rkn.gov.ru`, `consultant.ru`, `nalog.gov.ru` etc. as clickable links
- If the LLM is available, action text is personalized to the project description
- If the project description doesn't mention messaging, the ОРИ and Yarovaya items have a `status_note` saying they're conditionally relevant (visible as the amber dot + needs-review tag)

- [ ] **Step 9: Test filters**

Use the filter bar:
- Filter by `Priority: Blocker` — verify only blocker-tagged items remain visible
- Filter by `Category: Privacy` — verify only privacy-tagged items remain
- Filter by `Status: Needs review` — verify only items with `status_note` remain

Reset filters between tests.

- [ ] **Step 10: Test Review Compliance modal**

Click "Review compliance". Verify:
- Modal opens with a loading state
- After the LLM responds, the modal shows tabbed diff sections (Stale/Renamed/Missing/Removed/OK)
- The Removed tab is gated behind "Allow removals" checkbox
- Selecting items + clicking Apply N changes runs successfully
- Modal closes and the legal items refresh

If the LLM is unavailable, the modal should show an error with a Retry button.

- [ ] **Step 11: Test custom item form**

In any country card, click "Add custom item". Verify:
- An inline form appears with text input + priority dropdown + category dropdown
- Adding a custom item with priority=blocker, category=tax inserts it correctly
- The new item displays with its chosen priority and category badges
- The item has no Why/Action/Resources sections (custom items don't get LLM enrichment)

- [ ] **Step 12: Verify legacy backward compatibility**

If you have an existing project with old-format legal items (created before this rework):
- The items appear under their country card with default badges (`recommended` / `terms`)
- They have no Why/Action/Resources sections
- They're functionally the same as before — checkable, deletable
- The filter bar still works for them (they pass filters with default priority/category values)

- [ ] **Step 13: Mark Task 21 complete**

No commit needed. Manual verification only.

---

## Spec Coverage Self-Review Checklist

Before declaring the plan complete, scan the spec one more time against this checklist:

- [x] **Spec 2.1 (DB migration)** → Task 1
- [x] **Spec 2.2 (catalog file with types/helpers)** → Task 2
- [x] **Spec 2.3 (client types)** → Task 13
- [x] **Spec 3 (seeding flow with LLM enrichment + EU auto-attach + feature gating + failure handling)** → Task 7 (uses LLM wrapper from Task 6)
- [x] **Spec 3 (EU cascade on country removal)** → Task 8
- [x] **Spec 3 (EU items use country_code = '')** → Task 7 (server inserts), Task 13 (client type comment)
- [x] **Spec 4.1 (POST /legal/review endpoint)** → Task 10
- [x] **Spec 4.2 (POST /legal/review/apply endpoint)** → Task 11
- [x] **Spec 4.3 (review modal with tabbed diff and gated removals)** → Task 19
- [x] **Spec 4.4 (visual signals: amber dot, status_note tooltip, "Needs review" filter chip)** → Task 17 (item row), Task 16 (filter bar)
- [x] **Spec 5.1 (top bar with country selector + Review button + filter bar)** → Tasks 16 + 19
- [x] **Spec 5.2 (active chips with auto EU)** → Task 18
- [x] **Spec 5.3 (per-scope cards)** → Task 16
- [x] **Spec 5.4 (rich item rows with collapsible Why/Action/Resources)** → Task 17
- [x] **Spec 5.5 (legacy item rendering)** → Task 17 (default badges + null-safe rendering)
- [x] **Spec 5.6 (custom item form with priority/category dropdowns)** → Task 17 (built into LegalScopeCard)
- [x] **Spec 5.7 (disclaimer banner)** → Task 20
- [x] **Spec 6.2 (Russia coverage)** → Task 4
- [x] **Spec 6.3-6.6 (other countries + EU)** → Tasks 3, 5
- [x] **Spec 6.7 (open-source items)** → Task 5
- [x] **Spec 6.8 (project-type filtering)** → Task 7 (uses `itemsForCountry(cc, projectType)`)
- [x] **Spec 7.1 (modified existing endpoints)** → Tasks 7, 8, 9
- [x] **Spec 7.2 (new review endpoints)** → Tasks 10, 11
- [x] **Spec 7.3 (LLM client wrapper)** → Task 6
- [x] **Spec 8 (migration strategy: legacy items + EU cleanup)** → Task 12
- [x] **Spec 9 (out of scope)** → respected (no editing custom item metadata, no cron, no document generation, no per-state US)
- [x] **Spec 10 (risks and mitigations)** → all addressed in Task 6 (constrained LLM contracts, fallback on failure) and Task 19 (gated removals)

All spec sections have at least one corresponding task.
