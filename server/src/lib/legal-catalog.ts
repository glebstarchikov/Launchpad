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
