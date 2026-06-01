/**
 * Zod input schemas for all MCP tools.
 *
 * These schemas:
 * 1. Validate arguments passed by the AI agent before hitting the API
 * 2. Are converted to JSON Schema for MCP tool registration (inputSchema)
 *
 * Inline enums (z.enum) carry the canonical wire values for small/medium
 * dictionaries (seniorities, departments, funding stages, etc.). For large
 * dictionaries (locations, job titles, technologies, NAICS, SIC, industries)
 * use the search_suggestions tool to discover valid values.
 *
 * Plan-tier annotations in descriptions reflect what the API requires; the
 * API will reject filters above the caller's plan even if the schema accepts.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enum constants
// ---------------------------------------------------------------------------

const SENIORITY_VALUES = [
  "Founder/Owner",
  "C-Suite",
  "Partner",
  "Vice President",
  "Head",
  "Director",
  "Manager",
  "Senior",
  "Entry",
  "Intern",
] as const;

const EMPLOYEE_RANGE_VALUES = [
  "1-10",
  "11-20",
  "21-50",
  "51-100",
  "101-200",
  "201-500",
  "501-1000",
  "1001-2000",
  "2001-5000",
  "5001-10000",
  "10000+",
] as const;

const REVENUE_RANGE_VALUES = [
  "<100K",
  "100K",
  "500K",
  "1M",
  "5M",
  "10M",
  "25M",
  "50M",
  "100M",
  "250M",
  "500M",
  "1B",
  "5B",
  "10B+",
] as const;

const FUNDING_STAGE_VALUES = [
  "Pre seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Series E-J",
  "Series unknown",
  "Grant",
  "Angel",
  "Private equity",
  "Debt financing",
  "Non equity assistance",
  "Post IPO equity",
  "Post IPO debt",
  "Post IPO secondary",
  "Undisclosed",
  "Product crowdfunding",
  "Equity crowdfunding",
  "Corporate round",
  "Convertible note",
  "Secondary market",
  "Initial coin offering",
  "Other event",
] as const;

const TOP_LEVEL_DEPARTMENTS = [
  "C-Suite",
  "Consulting",
  "Design",
  "Education & Coaching",
  "Engineering & Technical",
  "Finance",
  "Human Resources",
  "Information Technology",
  "Legal",
  "Marketing",
  "Medical & Health",
  "Operations",
  "Product",
  "Sales",
] as const;

const HEADCOUNT_GROWTH_DEPARTMENTS = [
  "Administrative",
  "Consulting",
  "Customer service",
  "Design / UI / UX",
  "Education",
  "Finance",
  "General management",
  "HR",
  "Legal",
  "Marketing",
  "Medical",
  "Operations",
  "Product",
  "Project management",
  "Real estate",
  "Research",
  "Sales",
  "Technical",
  "Trades",
] as const;

const COMPANY_TYPE_STATUS = ["Private", "Public", "Non Profit", "Other"] as const;

const COMPANY_SUBTYPES = [
  "SaaS",
  "Marketplace",
  "E-commerce",
  "Agency",
  "Consulting",
  "Manufacturing",
  "Media/Publisher",
  "Education",
  "Non-Profit",
  "Government",
  "FinTech",
  "HealthTech",
  "AI/ML",
  "Hardware",
  "Professional Services",
  "Platform",
  "Data/Analytics",
  "Franchise",
  "Logistics",
  "Real Estate",
  "Legal",
  "Insurance",
  "Retail",
  "Hospitality",
  "Food & Beverage",
  "Construction",
  "Telecommunications",
] as const;

const BUSINESS_MODELS = [
  "b2b",
  "b2c",
  "b2b2c",
  "d2c",
  "marketplace",
  "franchise",
  "non_profit",
  "government",
] as const;

const NEWS_CATEGORIES = [
  "Funding & Investment",
  "Mergers & Acquisitions",
  "Product Launch",
  "Partnership",
  "Expansion",
  "Layoffs & Restructuring",
  "IPO",
  "Leadership Change",
  "Legal & Regulatory",
  "Awards & Recognition",
] as const;

const EXECUTIVE_EVENT_TYPES = [
  "CEO Departed",
  "CEO Appointed",
  "CTO Departed",
  "CTO Appointed",
  "CFO Departed",
  "CFO Appointed",
  "COO Departed",
  "COO Appointed",
  "CMO Departed",
  "CMO Appointed",
  "CRO Departed",
  "CRO Appointed",
  "VP of Sales Departed",
  "VP of Sales Appointed",
  "VP of Marketing Departed",
  "VP of Marketing Appointed",
  "VP of Engineering Departed",
  "VP of Engineering Appointed",
  "Any C-Level Departed",
  "Any C-Level Appointed",
  "Any VP Departed",
  "Any VP Appointed",
  "Any Director Departed",
  "Any Director Appointed",
] as const;

const ICP_DEPARTMENTS = [
  "Engineering",
  "Sales",
  "Marketing",
  "Finance",
  "HR",
  "Operations",
  "IT",
  "Legal",
  "Customer Success",
  "Procurement",
  "Data",
  "Security",
  "Design",
  "SMB Owners",
  "Consumers",
] as const;

const ICP_COMPANY_SIZES = ["micro", "smb", "midmarket", "enterprise", "large_enterprise"] as const;

// ---------------------------------------------------------------------------
// search_suggestions
// ---------------------------------------------------------------------------

export const SearchSuggestionsSchema = z
  .object({
    type: z
      .enum(["location", "job_title", "technology", "industry", "naics", "sic"])
      .describe(
        "Which value type to resolve. " +
          "'location' for person/company location filters; " +
          "'job_title' for person_job_title.include and company_job_posting_hiring_for; " +
          "'technology' for company_technology; " +
          "'industry' for company_industry; " +
          "'naics' / 'sic' return {code, label} pairs for company_naics / company_sics. " +
          "NAICS results follow the NAICS 2022 revision — legacy codes like 5112 (NAICS 2017 Software Publishers, now 5132) may not match; prefer label-based queries (e.g. 'software') when unsure of the current code."
      ),
    query: z
      .string()
      .min(2)
      .max(200)
      .describe("Search query (min 2 chars). Case-insensitive."),
  })
  .describe(
    "Discover canonical filter values before building a search. " +
      "Free endpoint — does not consume credits. Rate limited to 15 req/sec. " +
      "Call this FIRST whenever the user specifies a location, technology, industry, job title, NAICS, or SIC — " +
      "guessing strings (e.g. 'SF' vs 'San Francisco, California, United States') causes empty searches."
  );

export type SearchSuggestionsInput = z.input<typeof SearchSuggestionsSchema>;

// ---------------------------------------------------------------------------
// enrich_person
// ---------------------------------------------------------------------------

export const EnrichPersonSchema = z
  .object({
    linkedin_url: z
      .string()
      .url()
      .optional()
      .describe("LinkedIn profile URL, e.g. https://www.linkedin.com/in/johndoe"),
    email: z.string().email().optional().describe("Person's email address"),
    person_id: z.string().optional().describe("Prospeo person_id from a prior Search Person result"),
    first_name: z.string().optional().describe("Person's first name"),
    last_name: z.string().optional().describe("Person's last name"),
    full_name: z.string().optional().describe("Person's full name (alternative to first_name + last_name)"),
    company_name: z.string().optional().describe("Current employer name"),
    company_website: z.string().optional().describe("Company website domain, e.g. acme.com"),
    company_linkedin_url: z.string().url().optional().describe("Company LinkedIn URL"),
    only_verified_email: z
      .boolean()
      .optional()
      .default(false)
      .describe("Only return the result if a verified email is found"),
    enrich_mobile: z
      .boolean()
      .optional()
      .default(false)
      .describe("Also look up the person's mobile phone number (costs 10 credits; email is included at no extra cost when mobile is requested)"),
    only_verified_mobile: z
      .boolean()
      .optional()
      .default(false)
      .describe("Only return the result if a verified mobile is found (automatically enables enrich_mobile)"),
  })
  .describe(
    "Enrich a single person — find their professional email and/or mobile. " +
      "Pass EVERY identifier you have, not just the minimum — more fields means higher match rate. " +
      "If you know the LinkedIn URL, send it AND name AND company; if you know the name and company, send first_name + last_name + full_name + company_name + company_website + company_linkedin_url together. " +
      "Minimum to attempt a match: linkedin_url, email, person_id, or (first_name/full_name + company_name/company_website/company_linkedin_url). " +
      "If enriching MULTIPLE people (e.g. all results from a search), prefer bulk_enrich_person instead — same per-record cost, one call instead of many."
  );

export type EnrichPersonInput = z.input<typeof EnrichPersonSchema>;

// ---------------------------------------------------------------------------
// bulk_enrich_person
// ---------------------------------------------------------------------------

const BulkEnrichPersonRecord = z
  .object({
    identifier: z
      .string()
      .optional()
      .describe(
        "Optional correlation key returned with this record's result. " +
          "Defaults to person_id when provided, otherwise an index-based id (idx-0, idx-1, ...)."
      ),
    linkedin_url: z.string().url().optional().describe("LinkedIn profile URL"),
    email: z.string().email().optional().describe("Person's email address"),
    person_id: z.string().optional().describe("Prospeo person_id from a prior Search Person result"),
    first_name: z.string().optional().describe("Person's first name"),
    last_name: z.string().optional().describe("Person's last name"),
    full_name: z.string().optional().describe("Person's full name (alternative to first_name + last_name)"),
    company_name: z.string().optional().describe("Current employer name"),
    company_website: z.string().optional().describe("Company website domain, e.g. acme.com"),
    company_linkedin_url: z.string().url().optional().describe("Company LinkedIn URL"),
  })
  .describe(
    "Pass EVERY identifier you have for this person — more fields means higher match rate. " +
      "If you have a LinkedIn URL, still send name + company alongside it; if you have a name + company, send first_name + last_name + full_name + company_name + company_website + company_linkedin_url together. " +
      "Minimum to attempt a match: linkedin_url, email, person_id, OR (first_name+last_name / full_name) + (company_name / company_website / company_linkedin_url)."
  );

export const BulkEnrichPersonSchema = z
  .object({
    data: z
      .array(BulkEnrichPersonRecord)
      .min(1)
      .max(25)
      .describe("Up to 25 person records to enrich in a single request."),
    only_verified_email: z
      .boolean()
      .optional()
      .default(false)
      .describe("Only return records where a verified email is found. Applies to every record in `data`."),
    enrich_mobile: z
      .boolean()
      .optional()
      .default(false)
      .describe("Also look up mobile numbers (10 credits per matched record; email is included at no extra cost)."),
    only_verified_mobile: z
      .boolean()
      .optional()
      .default(false)
      .describe("Only return records where a verified mobile is found (automatically enables enrich_mobile)."),
  })
  .describe(
    "Enrich up to 25 people in one call — the canonical follow-up to search_person. " +
      "Pass each search result's person_id as a record; the matched.identifier in the response will equal that person_id so you can stitch results back to the original list. " +
      "When records come from outside Prospeo (e.g. scraped names, CRM rows), pass EVERY identifier you have per record — first_name + last_name + full_name + company_name + company_website + company_linkedin_url + linkedin_url all together — rather than the bare minimum. " +
      "Same per-record credit cost as enrich_person. " +
      "Returns a compact response per record (no job_history, no skills, abbreviated company summary) — use enrich_person if you need the full profile for a specific person."
  );

export type BulkEnrichPersonInput = z.input<typeof BulkEnrichPersonSchema>;

// ---------------------------------------------------------------------------
// enrich_company
// ---------------------------------------------------------------------------

export const EnrichCompanySchema = z
  .object({
    company_name: z.string().optional().describe("Company name, e.g. Acme Inc"),
    company_website: z.string().optional().describe("Company website domain, e.g. acme.com"),
    company_linkedin_url: z.string().url().optional().describe("Company LinkedIn URL"),
    company_id: z.string().optional().describe("Prospeo company_id from a prior Enrich Person or Search result"),
  })
  .describe(
    "Enrich a company — get full profile including headcount, industry, revenue range, tech stack, and more. " +
      "Pass EVERY identifier you have, not just the minimum — more fields means higher match rate. " +
      "If you know the website, send it AND company_name AND company_linkedin_url together; pass company_id too when you have it from a prior result. " +
      "Minimum to attempt a match: company_website (preferred), company_linkedin_url, company_name, or company_id."
  );

export type EnrichCompanyInput = z.input<typeof EnrichCompanySchema>;

// ---------------------------------------------------------------------------
// bulk_enrich_company
// ---------------------------------------------------------------------------

const BulkEnrichCompanyRecord = z
  .object({
    identifier: z
      .string()
      .optional()
      .describe(
        "Optional correlation key returned with this record's result. " +
          "Defaults to company_id when provided, otherwise an index-based id (idx-0, idx-1, ...)."
      ),
    company_name: z.string().optional().describe("Company name, e.g. Acme Inc"),
    company_website: z.string().optional().describe("Company website domain, e.g. acme.com"),
    company_linkedin_url: z.string().url().optional().describe("Company LinkedIn URL"),
    company_id: z.string().optional().describe("Prospeo company_id from a prior search/enrich result"),
  })
  .describe(
    "Pass EVERY identifier you have for this company — more fields means higher match rate. " +
      "If you have a website, still send company_name and company_linkedin_url alongside it; pass company_id too when it's known from a prior result. " +
      "Minimum to attempt a match: one of company_id, company_website, company_linkedin_url, or company_name."
  );

export const BulkEnrichCompanySchema = z
  .object({
    data: z
      .array(BulkEnrichCompanyRecord)
      .min(1)
      .max(25)
      .describe("Up to 25 company records to enrich in a single request."),
  })
  .describe(
    "Enrich up to 25 companies in one call — the canonical lookup tool when you already have company names/domains (e.g. CRM exports, account lists, competitor maps). " +
      "Each match returns the full company profile: headcount, industry, revenue, tech stack, funding, attributes, job postings, social links. " +
      "Identifier defaults to company_id when provided, so passing search_company results back is trivial. " +
      "When records come from outside Prospeo (CRM rows, scraped lists), pass EVERY identifier you have per record — company_name + company_website + company_linkedin_url all together — rather than the bare minimum. " +
      "1 credit per matched company. Use search_company instead when you don't yet know which companies to target."
  );

export type BulkEnrichCompanyInput = z.input<typeof BulkEnrichCompanySchema>;

// ---------------------------------------------------------------------------
// Shared filter building blocks
// ---------------------------------------------------------------------------

const includeExcludeStr = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

const rangeNum = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Company filters — used in both search_person and search_company
// ---------------------------------------------------------------------------

const CompanyFilters = {
  /**
   * Filter by specific company names and/or website domains.
   * Use `names` for company name matching, `websites` for domain matching (e.g. "stripe.com").
   * Websites should be root domains (no www., no subdomains).
   */
  company: z
    .object({
      names: includeExcludeStr.optional(),
      websites: includeExcludeStr.optional(),
    })
    .optional(),

  /**
   * Filter by company HQ location (city, region, or country).
   * Values MUST come from search_suggestions with type='location' — invalid strings are rejected.
   * Example after suggestion: include: ["United States", "California, United States"]
   */
  company_location_search: includeExcludeStr.optional(),

  /**
   * Filter by predefined headcount brackets.
   * Cannot be combined with company_headcount_custom.
   */
  company_headcount_range: z.array(z.enum(EMPLOYEE_RANGE_VALUES)).optional(),

  /**
   * Filter by exact headcount range. Cannot be combined with company_headcount_range.
   * Min 1, max 999999.
   */
  company_headcount_custom: rangeNum.optional(),

  /**
   * Filter by industry. ~256 valid strings — use search_suggestions with type='industry' to discover them.
   * Example after suggestion: include: ["Computer Software", "Information Technology and Services"]
   */
  company_industry: includeExcludeStr.optional(),

  /**
   * Filter by keywords found in company descriptions or SEO metadata.
   * Each keyword must be 3–50 characters — two-letter acronyms like "HR", "AI",
   * "ML", "IT", "PR" are rejected; spell them out as "human resources",
   * "artificial intelligence", etc.
   * Max 20 keywords total. include_all: true → ALL included keywords required (AND); default OR.
   */
  company_keywords: z
    .object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
      include_all: z.boolean().optional(),
      include_company_description: z.boolean().optional(),
      include_company_description_seo: z.boolean().optional(),
    })
    .optional(),

  /**
   * Filter companies by buying-intent topics they're researching.
   * `topic_ids` are topic NAMES (e.g. "Marketing Software", "Cloud Security") the user has
   * configured in their Prospeo dashboard → Intent settings. Topics not on the user's
   * account are rejected, and they cannot be discovered via the API — always ASK the user
   * which topics to filter by; do not guess.
   * Set any of `in_depth_research`, `active_research`, `early_research` to true to narrow
   * to those intent stages; omit all three to include any stage.
   */
  company_intent: z
    .object({
      topic_ids: z.array(z.string()).min(1).max(30),
      in_depth_research: z.boolean().optional(),
      active_research: z.boolean().optional(),
      early_research: z.boolean().optional(),
    })
    .optional(),

  /**
   * Filter by company attributes (boolean flags).
   * Each field: true = require it, false = exclude it, null/omit = ignore.
   * Includes general traits, platform features, content/marketing surfaces,
   * support channels, certifications/compliance, and presence signals.
   */
  company_attributes: z
    .object({
      // General
      b2b: z.boolean().nullable().optional(),
      demo: z.boolean().nullable().optional(),
      freetrial: z.boolean().nullable().optional(),
      downloadable: z.boolean().nullable().optional(),
      mobileapps: z.boolean().nullable().optional(),
      onlinereviews: z.boolean().nullable().optional(),
      pricing: z.boolean().nullable().optional(),
      uses_ai: z.boolean().nullable().optional(),
      // Platform features
      has_api: z.boolean().nullable().optional(),
      has_chrome_extension: z.boolean().nullable().optional(),
      has_sso: z.boolean().nullable().optional(),
      has_uptime_guarantee: z.boolean().nullable().optional(),
      has_open_source: z.boolean().nullable().optional(),
      has_marketplace: z.boolean().nullable().optional(),
      // Content & marketing
      has_blog: z.boolean().nullable().optional(),
      has_podcast: z.boolean().nullable().optional(),
      has_community_forum: z.boolean().nullable().optional(),
      has_knowledge_base: z.boolean().nullable().optional(),
      has_academy: z.boolean().nullable().optional(),
      has_affiliate_program: z.boolean().nullable().optional(),
      has_case_studies: z.boolean().nullable().optional(),
      has_testimonials: z.boolean().nullable().optional(),
      // Support channels
      has_phone_support: z.boolean().nullable().optional(),
      has_email_support: z.boolean().nullable().optional(),
      has_chat_support: z.boolean().nullable().optional(),
      has_ticket_support: z.boolean().nullable().optional(),
      has_social_support: z.boolean().nullable().optional(),
      // Certifications & compliance
      has_soc2: z.boolean().nullable().optional(),
      has_iso27001: z.boolean().nullable().optional(),
      has_gdpr: z.boolean().nullable().optional(),
      has_hipaa: z.boolean().nullable().optional(),
      has_ccpa: z.boolean().nullable().optional(),
      has_pci_dss: z.boolean().nullable().optional(),
      other_compliance: z.array(z.string().max(50)).max(50).optional(),
      compliance_match_mode: z.enum(["EXACT", "CONTAINS"]).optional(),
      has_esg_reports: z.boolean().nullable().optional(),
      // Presence
      data_residency: z.string().max(50).optional(),
      has_physical_offices: z.boolean().nullable().optional(),
      is_venture_backed: z.boolean().nullable().optional(),
      is_publicly_traded: z.boolean().nullable().optional(),
    })
    .optional(),

  /**
   * Filter by NAICS industry codes. Pass the `code` field from search_suggestions
   * verbatim — values are strings to preserve SIC-style leading zeros and to
   * round-trip cleanly from the suggestion response.
   * Max 100 codes per include/exclude. Use search_suggestions with type='naics' to discover codes.
   */
  company_naics: z
    .object({
      include: z.array(z.string()).max(100).optional(),
      exclude: z.array(z.string()).max(100).optional(),
    })
    .optional(),

  /**
   * Filter by SIC industry codes. Pass the `code` field from search_suggestions
   * verbatim — values are strings because SIC codes like "0111" (Wheat) have
   * leading zeros that would be lost as integers.
   * Max 100 codes per include/exclude. Use search_suggestions with type='sic' to discover codes.
   */
  company_sics: z
    .object({
      include: z.array(z.string()).max(100).optional(),
      exclude: z.array(z.string()).max(100).optional(),
    })
    .optional(),

  /**
   * Filter by annual revenue range. Minimum plan: Starter.
   * include_unknown_revenue → include companies with no revenue data.
   */
  company_revenue: z
    .object({
      min: z.enum(REVENUE_RANGE_VALUES).optional(),
      max: z.enum(REVENUE_RANGE_VALUES).optional(),
      include_unknown_revenue: z.boolean().optional(),
    })
    .optional(),

  /**
   * Filter by company type, subtypes, business model, and characteristic flags.
   * status: company legal type. subtypes.include: pick from canonical subtype list.
   * business_model: how the company makes money. The boolean flags below capture
   * common GTM and product traits.
   */
  company_type: z
    .object({
      status: z.enum(COMPANY_TYPE_STATUS).optional(),
      subtypes: z
        .object({
          include: z.array(z.enum(COMPANY_SUBTYPES)).optional(),
        })
        .optional(),
      business_model: z.enum(BUSINESS_MODELS).optional(),
      is_retail: z.boolean().nullable().optional(),
      is_marketplace: z.boolean().nullable().optional(),
      is_mainly_ai: z.boolean().nullable().optional(),
      is_mainly_crypto: z.boolean().nullable().optional(),
      multi_product: z.boolean().nullable().optional(),
      has_free_tier: z.boolean().nullable().optional(),
      is_self_serve: z.boolean().nullable().optional(),
      is_sales_led: z.boolean().nullable().optional(),
      has_usage_pricing: z.boolean().nullable().optional(),
      has_subscription: z.boolean().nullable().optional(),
      has_enterprise_plan: z.boolean().nullable().optional(),
      has_public_pricing: z.boolean().nullable().optional(),
    })
    .optional(),

  /**
   * Filter by funding stage, investors, and dollar amounts. Minimum plan: Starter.
   * stage: pick from canonical funding stage list (max 500).
   * funding_date: days since last round.
   * last_funding / total_funding: dollar amounts via the same revenue-range scale.
   * investors: filter by named investors (max 10).
   * was_in_accelerator + accelerator_name: accelerator participation.
   */
  company_funding: z
    .object({
      stage: z.array(z.enum(FUNDING_STAGE_VALUES)).max(500).optional(),
      funding_date: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180), z.literal(270), z.literal(365)]).optional(),
      last_funding: z
        .object({
          min: z.enum(REVENUE_RANGE_VALUES).optional(),
          max: z.enum(REVENUE_RANGE_VALUES).optional(),
        })
        .optional(),
      total_funding: z
        .object({
          min: z.enum(REVENUE_RANGE_VALUES).optional(),
          max: z.enum(REVENUE_RANGE_VALUES).optional(),
        })
        .optional(),
      investors: z.array(z.string().max(100)).max(10).optional(),
      was_in_accelerator: z.boolean().optional(),
      accelerator_name: z.string().max(100).optional(),
    })
    .optional(),

  /**
   * Filter by technologies used by the company. Minimum plan: Starter.
   * Max 20 values per list. ~5,000 valid technology strings — always use
   * search_suggestions with type='technology' to discover canonical names.
   */
  company_technology: z
    .object({
      include: z.array(z.string()).max(20).optional(),
      exclude: z.array(z.string()).max(20).optional(),
    })
    .optional(),

  /**
   * Filter by company founding year.
   * include_unknown_founded → include companies with unknown founding year. Default true.
   */
  company_founded: z
    .object({
      min: z.number().int().min(1900).optional(),
      max: z.number().int().optional(),
      include_unknown_founded: z.boolean().optional(),
    })
    .optional(),

  /**
   * Filter by headcount growth percentage over a time window.
   * Provide timeframe_month + min/max percentage. Optional departments narrows
   * the growth measurement to specific functional groups.
   */
  company_headcount_growth: z
    .object({
      timeframe_month: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24)]).optional(),
      min: z.number().int().min(-100).max(10000).optional(),
      max: z.number().int().min(-100).max(10000).optional(),
      departments: z.array(z.enum(HEADCOUNT_GROWTH_DEPARTMENTS)).max(10).optional(),
    })
    .optional(),

  /**
   * Filter companies actively hiring for specific job titles. Minimum plan: Starter.
   * Either include/exclude lists with match_type, OR boolean_search — not both.
   * boolean_search: AND/OR/!/quotes, max 500 terms, max 5 paren depth.
   */
  company_job_posting_hiring_for: z
    .object({
      include: z.array(z.string().min(1).max(200)).max(500).optional(),
      exclude: z.array(z.string().min(1).max(200)).max(500).optional(),
      match_type: z.enum(["contains", "exact"]).optional(),
      boolean_search: z.string().max(5000).optional(),
    })
    .optional(),

  /**
   * Filter by number of open job postings. Minimum plan: Starter.
   * Min 0, max 5000.
   */
  company_job_posting_quantity: rangeNum.optional(),

  /**
   * Filter by headcount within specific top-level departments. Max 10 entries.
   * Submitting a top-level department also matches its sub-departments.
   */
  company_headcount_by_department: z
    .array(
      z.object({
        department: z.enum(TOP_LEVEL_DEPARTMENTS),
        min: z.number().int().min(0).max(100000).optional(),
        max: z.number().int().min(0).max(100000).optional(),
      })
    )
    .max(10)
    .optional(),

  /**
   * Filter by the email provider used by the company (e.g. "Google", "Microsoft").
   * 107 valid values per the MX providers reference; case-sensitive exact match.
   */
  company_email_provider: z.array(z.string()).optional(),

  /**
   * Per-country headcount range filter. Minimum plan: Growth.
   * 1-10 entries, each with country + min/max range.
   */
  company_headcount_by_location: z
    .object({
      entries: z
        .array(
          z.object({
            country: z.string().min(1).max(100),
            min_headcount: z.number().int().min(0).max(1000000).nullable().optional(),
            max_headcount: z.number().int().min(0).max(1000000).nullable().optional(),
          })
        )
        .min(1)
        .max(10),
    })
    .optional(),

  /**
   * Filter by recent company news. Either keywords or categories required.
   * timeframe_days: look-back window (60/90/180/365); default 90.
   */
  company_news: z
    .object({
      keywords: z.array(z.string().max(100)).max(20).optional(),
      categories: z.array(z.enum(NEWS_CATEGORIES)).max(10).optional(),
      timeframe_days: z.union([z.literal(60), z.literal(90), z.literal(180), z.literal(365)]).optional(),
    })
    .optional(),

  /**
   * Filter by executive leadership change events. Minimum plan: Pro.
   * Use event_types like "CEO Departed", "Any C-Level Appointed".
   * timeframe_days: 60/90/180/365; default 90.
   */
  company_key_execs: z
    .object({
      event_types: z.array(z.enum(EXECUTIVE_EVENT_TYPES)).min(1).max(10),
      timeframe_days: z.union([z.literal(60), z.literal(90), z.literal(180), z.literal(365)]).optional(),
    })
    .optional(),

  /**
   * Filter by website traffic volume, change trends, and audience countries. Minimum plan: Pro.
   * At least one of: visits range, visit_change, or top_countries.
   */
  company_website_traffic: z
    .object({
      min_monthly_visits: z.number().int().min(0).max(100000000).nullable().optional(),
      max_monthly_visits: z.number().int().min(0).max(100000000).nullable().optional(),
      visit_change: z
        .object({
          period: z.enum(["monthly", "quarterly", "yearly"]).optional(),
          min_change: z.number().min(-100).max(10000).nullable().optional(),
          max_change: z.number().min(-100).max(10000).nullable().optional(),
        })
        .optional(),
      top_countries: z.array(z.string()).max(5).nullable().optional(),
      min_country_pct: z.number().min(0).max(100).nullable().optional(),
      max_country_pct: z.number().min(0).max(100).nullable().optional(),
    })
    .optional(),

  /**
   * Find companies that sell to specific brand customers (include-only). Minimum plan: Growth.
   * Useful for "find competitors of X" workflows.
   */
  company_key_customers: z
    .object({
      include: z.array(z.string().max(100)).min(1).max(100),
    })
    .optional(),

  /**
   * Find companies similar to seed companies. Minimum plan: Starter.
   * Use EXACTLY ONE mode: company_oids OR icp_text OR domain.
   * person_oids is also accepted but only when used inside search_person.
   * minimum_tier: T1 = strongest match, T3 = broadest. Default T3.
   *
   * PREFERRED: when the user names a known company (e.g. "find companies like Google"),
   * first call search_company({"company": {"names": {"include": ["Google"]}}}) to get the
   * company_id, then pass it as company_oids.
   * Reserve domain mode for unknown/small companies not yet in Prospeo's database.
   */
  company_lookalike: z
    .object({
      company_oids: z.array(z.string()).max(10).optional(),
      icp_text: z.string().max(5000).nullable().optional(),
      domain: z.string().nullable().optional(),
      person_oids: z.array(z.string()).max(10).optional(),
      match_all: z.boolean().optional(),
      same_language: z.boolean().optional(),
      minimum_tier: z.enum(["T1", "T2", "T3"]).optional(),
    })
    .optional(),

  /**
   * Full-text search across crawled company websites. Minimum plan: Pro.
   * Combine keyword matching with structural filters (has_persona_pages, etc.).
   */
  company_website_search: z
    .object({
      include_keywords: z.array(z.string().max(200)).max(10).nullable().optional(),
      exclude_keywords: z.array(z.string().max(200)).max(10).nullable().optional(),
      match_mode: z.enum(["any", "all"]).optional(),
      search_in: z
        .object({
          page_body: z.boolean().optional(),
          page_titles: z.boolean().optional(),
          urls_only: z.boolean().optional(),
          headings_only: z.boolean().optional(),
          seo_description: z.boolean().optional(),
        })
        .optional(),
      page_scope: z.array(z.enum(["homepage", "product", "blog", "careers", "about"])).max(5).nullable().optional(),
      url_contains: z.string().max(200).nullable().optional(),
      has_persona_pages: z.boolean().nullable().optional(),
      has_industry_pages: z.boolean().nullable().optional(),
      has_solution_pages: z.boolean().nullable().optional(),
      has_careers_page: z.boolean().nullable().optional(),
      has_status_page: z.boolean().nullable().optional(),
      has_sla_page: z.boolean().nullable().optional(),
      has_developer_docs_page: z.boolean().nullable().optional(),
      has_investor_page: z.boolean().nullable().optional(),
      has_security_page: z.boolean().nullable().optional(),
      has_comparison_pages: z.boolean().nullable().optional(),
    })
    .optional(),

  /**
   * Filter by Ideal Customer Profile signals — who the target company sells TO.
   * Minimum plan: Growth. Useful when prospecting vendors that serve a specific persona.
   */
  company_icp: z
    .object({
      titles_include: z.array(z.string().max(100)).max(20).optional(),
      titles_exclude: z.array(z.string().max(100)).max(20).optional(),
      company_sizes: z.array(z.enum(ICP_COMPANY_SIZES)).max(5).optional(),
      industries: z.array(z.string().max(100)).max(10).optional(),
      geographic_markets: z.array(z.string()).max(10).optional(),
      geographic_scope: z.enum(["single_country", "multi_country"]).nullable().optional(),
      departments: z
        .object({
          include: z.array(z.enum(ICP_DEPARTMENTS)).max(15).optional(),
          match_mode: z.enum(["any", "all"]).optional(),
          other: z.array(z.string().max(100)).max(5).optional(),
        })
        .optional(),
    })
    .optional(),

  /**
   * Find companies by SEO keywords they rank for. Minimum plan: Pro.
   * 1-100 keywords, each max 100 chars.
   */
  company_google_discovery: z
    .object({
      seo_keywords: z.array(z.string().max(100)).min(1).max(100),
    })
    .optional(),

  /**
   * Filter by product and service tags. At least one include is required before excludes.
   */
  company_products_services: z
    .object({
      products_include: z.array(z.string().max(100)).max(20).optional(),
      products_exclude: z.array(z.string().max(100)).max(10).optional(),
      products_match_all: z.boolean().optional(),
      service_tags_include: z.array(z.string().max(100)).max(20).optional(),
      service_tags_exclude: z.array(z.string().max(100)).max(10).optional(),
      service_tags_match_all: z.boolean().optional(),
    })
    .optional(),

  /**
   * Filter by integrations mentioned on the company's website. Minimum plan: Growth.
   * At least one include is required before excludes.
   */
  company_integrations: z
    .object({
      include: z.array(z.string().max(100)).max(20).optional(),
      exclude: z.array(z.string().max(100)).max(10).optional(),
    })
    .optional(),

  /**
   * Filter by award names. Minimum plan: Growth.
   * For SOC2/ISO/HIPAA-style certifications, use company_attributes (has_soc2 etc.) instead.
   */
  company_awards: z
    .object({
      include: z.array(z.string().max(100)).min(1).max(50),
      match_mode: z.enum(["EXACT", "CONTAINS"]).optional(),
    })
    .optional(),

  /**
   * Filter by spoken/written languages the company operates in. Include-only.
   * Max 10 language names (e.g. "English", "French", "German").
   */
  company_operating_languages: z
    .object({
      include: z.array(z.string().max(50)).min(1).max(10),
    })
    .optional(),
};

// ---------------------------------------------------------------------------
// Person filters (used only by search_person)
// ---------------------------------------------------------------------------

const PersonFilters = {
  /**
   * Search people by name, company name, or company domain.
   * match_mode 'SMART' (default) widens search to company fields too; 'STRICT' is name-only.
   * Replaces the legacy person_name filter — do not send both.
   */
  person_search: z
    .object({
      include: z.array(z.string().min(1).max(100)).max(500).optional(),
      exclude: z.array(z.string().min(1).max(100)).max(500).optional(),
      match_mode: z.enum(["SMART", "STRICT"]).optional(),
    })
    .optional(),

  /**
   * Strict name-only matching. Equivalent to person_search with match_mode='STRICT'.
   * Use when you have exact name strings to look up; for broader matching that
   * also searches company name and domain, use person_search instead.
   * Do not send both person_name and person_search in the same request.
   */
  person_name: z
    .object({
      include: z.array(z.string().min(1).max(100)).max(500).optional(),
      exclude: z.array(z.string().min(1).max(100)).max(500).optional(),
    })
    .optional(),

  /**
   * Quick free-text search across both person name AND job title fields.
   * For structured searches prefer person_search + person_job_title.
   */
  person_name_or_job_title: z.string().optional(),

  /**
   * Filter by job title with exact/contains/similar matching, or advanced boolean search.
   * include/exclude (max 100 each, 2-100 chars) cannot be combined with boolean_search.
   * match_mode: CONTAINS (most common), EXACT (full title), SIMILAR (expands to related titles).
   *   Always specify match_mode explicitly — the default behavior is not guaranteed across API versions.
   * smart_intensity only applies when match_mode='SIMILAR'.
   */
  person_job_title: z
    .object({
      include: z.array(z.string().min(2).max(100)).max(100).optional(),
      exclude: z.array(z.string().min(2).max(100)).max(100).optional(),
      match_mode: z.enum(["CONTAINS", "EXACT", "SIMILAR"]).optional(),
      smart_intensity: z.enum(["LOOSE", "NORMAL", "STRICT"]).optional(),
      boolean_search: z.string().max(5000).optional(),
    })
    .strict()
    .optional(),

  /**
   * Filter by top-level functional department. Submitting a top-level (e.g. "Sales")
   * automatically pulls all sub-departments. See API docs for finer-grained
   * sub-departments if needed.
   */
  person_department: z
    .object({
      include: z.array(z.enum(TOP_LEVEL_DEPARTMENTS)).max(500).optional(),
      exclude: z.array(z.enum(TOP_LEVEL_DEPARTMENTS)).max(500).optional(),
    })
    .optional(),

  /**
   * Filter by seniority level.
   */
  person_seniority: z
    .object({
      include: z.array(z.enum(SENIORITY_VALUES)).max(SENIORITY_VALUES.length).optional(),
      exclude: z.array(z.enum(SENIORITY_VALUES)).max(SENIORITY_VALUES.length).optional(),
    })
    .optional(),

  /**
   * Filter by person's location.
   * Values MUST come from search_suggestions with type='location'.
   */
  person_location_search: z
    .object({
      include: z.array(z.string().min(1).max(200)).max(100).optional(),
      exclude: z.array(z.string().min(1).max(200)).max(100).optional(),
    })
    .optional(),

  /**
   * Filter by whether the person has a verified email and/or mobile.
   * email: ["VERIFIED"] requires verified email.
   * mobile: ["VERIFIED"] requires verified mobile, ["UNAVAILABLE"] excludes mobile-less records.
   * operator: 'OR' (default) or 'AND' — how email/mobile conditions combine.
   */
  person_contact_details: z
    .object({
      email: z.array(z.enum(["VERIFIED"])).optional(),
      mobile: z.array(z.enum(["VERIFIED", "UNAVAILABLE"])).optional(),
      operator: z.enum(["OR", "AND"]).optional(),
      hide_people_with_details_already_revealed: z.boolean().optional(),
    })
    .optional(),

  /**
   * Cap people returned per company (1-100). Diversifies results across companies.
   */
  max_person_per_company: z.number().int().min(1).max(100).optional(),

  /**
   * Filter by total years of professional experience. Min 0, max 60.
   */
  person_year_of_experience: z
    .object({
      min: z.number().int().min(0).max(60).optional(),
      max: z.number().int().min(1).max(60).optional(),
    })
    .optional(),

  /**
   * Filter by months in current role. Min 0, max 600.
   */
  person_time_in_current_role: z
    .object({
      min: z.number().int().min(0).max(600).optional(),
      max: z.number().int().min(0).max(600).optional(),
    })
    .optional(),

  /**
   * Filter by months at current company. Min 0, max 600.
   */
  person_time_in_current_company: z
    .object({
      min: z.number().int().min(0).max(600).optional(),
      max: z.number().int().min(0).max(600).optional(),
    })
    .optional(),

  /**
   * Filter for people who recently changed jobs. Minimum plan: Growth.
   * only_promotion and only_new_company cannot both be true.
   */
  person_job_change: z
    .object({
      timeframe_days: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180), z.literal(270), z.literal(365)]).optional(),
      only_promotion: z.boolean().optional(),
      only_new_company: z.boolean().optional(),
    })
    .optional(),
};

// ---------------------------------------------------------------------------
// search_person
// ---------------------------------------------------------------------------

export const SearchPersonSchema = z
  .object({
    filters: z
      .object({
        ...PersonFilters,
        ...CompanyFilters,
      })
      .describe(
        "Filter object combining person-specific filters and company filters. " +
          "At least one positive (include) filter is required — exclude-only payloads are rejected for performance. " +
          "For values that can't be guessed (locations, technologies, industries, NAICS, SIC, job titles), call search_suggestions first."
      ),
    page: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(1)
      .describe("Page number (1–1000). Each page returns up to 25 results."),
  })
  .describe(
    "Search Prospeo's professional database using typed filters. " +
      "Returns up to 25 people per page (max 1000 pages). Costs 1 credit per page that returns results. " +
      "After getting results, enrich them all in one call via bulk_enrich_person — pass each result's person_id as a record."
  );

export type SearchPersonInput = z.input<typeof SearchPersonSchema>;

// ---------------------------------------------------------------------------
// search_company
// ---------------------------------------------------------------------------

export const SearchCompanySchema = z
  .object({
    filters: z
      .object(CompanyFilters)
      .describe(
        "Company search filters. At least one positive (include) filter is required. " +
          "For values that can't be guessed (locations, technologies, industries, NAICS, SIC), call search_suggestions first."
      ),
    page: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(1)
      .describe("Page number (1–1000). Each page returns up to 25 results."),
  })
  .describe(
    "Search Prospeo's company database using typed filters. " +
      "Returns up to 25 companies per page (max 1000 pages). Costs 1 credit per page that returns results. " +
      "Search results already include the summary fields (name, website, industry, headcount, revenue range, location, funding, keywords) — only call enrich_company / bulk_enrich_company when you specifically need the deeper profile (tech stack, attributes, job postings, descriptions, social URLs, phone), since each match costs 1 additional credit."
  );

export type SearchCompanyInput = z.input<typeof SearchCompanySchema>;
