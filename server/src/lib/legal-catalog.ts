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
