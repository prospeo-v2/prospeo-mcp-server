/**
 * Zod input schemas for all MCP tools.
 *
 * These schemas:
 * 1. Validate arguments passed by the AI agent before hitting the API
 * 2. Are converted to JSON Schema for MCP tool registration (inputSchema)
 */

import { z } from "zod";

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
    "Enrich a person — find their professional email and/or mobile. " +
      "Provide at least one of: linkedin_url, email, person_id, or (first_name/full_name + company_name/company_website)."
  );

export type EnrichPersonInput = z.input<typeof EnrichPersonSchema>;

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
      "Provide at least one of: company_website (preferred), company_linkedin_url, company_name, or company_id."
  );

export type EnrichCompanyInput = z.infer<typeof EnrichCompanySchema>;

// ---------------------------------------------------------------------------
// Shared filter building blocks
// ---------------------------------------------------------------------------

/** Generic include/exclude filter for string values */
const includeExcludeStr = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

/** Generic min/max range (numbers) */
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
   */
  company: z
    .object({
      names: includeExcludeStr.optional(),
      websites: includeExcludeStr.optional(),
    })
    .optional(),

  /**
   * Filter by company HQ location (city, region, or country).
   * Values must be valid Prospeo locations — use the Search Suggestions API to enumerate valid strings.
   * Example: include: ["United States", "California, United States"]
   */
  company_location_search: includeExcludeStr.optional(),

  /**
   * Filter by headcount using predefined size brackets.
   * Allowed values: "1-10", "11-20", "21-50", "51-100", "101-200", "201-500",
   * "501-1000", "1001-2000", "2001-5000", "5001-10000", "10000+"
   */
  company_headcount_range: z.array(z.string()).optional(),

  /**
   * Filter by exact headcount range (overrides company_headcount_range).
   * Min 1, max 999999.
   */
  company_headcount_custom: rangeNum.optional(),

  /**
   * Filter by industry. Use the Search Suggestions API to enumerate the 256 valid industry strings.
   * Example: include: ["Computer Software", "Information Technology and Services"]
   */
  company_industry: includeExcludeStr.optional(),

  /**
   * Filter by keywords found in company descriptions or SEO metadata.
   * Max 20 keywords total (3–50 chars each).
   * Set include_all: true to require ALL included keywords (AND logic); default is OR.
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
   * Filter by company product/website attributes (boolean flags).
   * Set to true to require the attribute, false to exclude it, null to ignore.
   */
  company_attributes: z
    .object({
      b2b: z.boolean().nullable().optional(),
      demo: z.boolean().nullable().optional(),
      freetrial: z.boolean().nullable().optional(),
      downloadable: z.boolean().nullable().optional(),
      mobileapps: z.boolean().nullable().optional(),
      onlinereviews: z.boolean().nullable().optional(),
      pricing: z.boolean().nullable().optional(),
    })
    .optional(),

  /**
   * Filter by NAICS industry codes (integer codes).
   * Max 100 codes per include/exclude.
   */
  company_naics: z
    .object({
      include: z.array(z.number().int()).optional(),
      exclude: z.array(z.number().int()).optional(),
    })
    .optional(),

  /**
   * Filter by SIC industry codes (integer codes).
   * Max 100 codes per include/exclude.
   */
  company_sics: z
    .object({
      include: z.array(z.number().int()).optional(),
      exclude: z.array(z.number().int()).optional(),
    })
    .optional(),

  /**
   * Filter by annual revenue range.
   * Allowed threshold strings: "<100K", "100K", "500K", "1M", "5M", "10M", "25M",
   * "50M", "100M", "250M", "500M", "1B", "5B", "10B+"
   */
  company_revenue: z
    .object({
      min: z.string().optional(),
      max: z.string().optional(),
      include_unknown_revenue: z.boolean().optional(),
    })
    .optional(),

  /**
   * Filter by company legal type.
   * Allowed values: "Private", "Public", "Non Profit", "Other"
   */
  company_type: z.string().optional(),

  /**
   * Filter by funding stage and amount.
   * stage: up to 16 predefined funding round labels, e.g. "Seed", "Series A", "Series B",
   *   "Series C", "Series D", "Series E", "Series F", "Pre-seed", "Grant",
   *   "Debt Financing", "Private Equity", "IPO", "Secondary Market",
   *   "Post-IPO Equity", "Post-IPO Debt", "Post-IPO Secondary"
   * funding_date: look-back window in days — allowed: 30, 60, 90, 180, 270, 365
   * last_funding / total_funding: dollar amount ranges
   */
  company_funding: z
    .object({
      stage: z.array(z.string()).optional(),
      funding_date: z.number().optional(),
      last_funding: rangeNum.optional(),
      total_funding: rangeNum.optional(),
    })
    .optional(),

  /**
   * Filter by technologies the company uses (e.g. "Salesforce", "React", "AWS").
   * Max 20 values. Use the Search Suggestions API to enumerate the ~5000 valid technology strings.
   */
  company_technology: includeExcludeStr.optional(),

  /**
   * Filter by company founding year.
   * Min 1900, max current year.
   */
  company_founded: z
    .object({
      min: z.number().int().min(1900).optional(),
      max: z.number().int().optional(),
      include_unknown_founded: z.boolean().optional(),
    })
    .optional(),

  /**
   * Filter by headcount growth rate over a time window.
   * timeframe_month: 3, 6, 12, or 24
   * min/max: growth percentage, -100 to 10000
   * departments: optional list of departments to measure growth within (max 10)
   */
  company_headcount_growth: z
    .object({
      timeframe_month: z.number().optional(),
      min: z.number().int().min(-100).max(10000).optional(),
      max: z.number().int().min(-100).max(10000).optional(),
      departments: z.array(z.string()).max(10).optional(),
    })
    .optional(),

  /**
   * Filter companies that are actively hiring for specific job titles.
   * Max 500 items, each 1–200 characters.
   */
  company_job_posting_hiring_for: z.array(z.string().min(1).max(200)).max(500).optional(),

  /**
   * Filter by number of open job postings.
   * Min 0, max 5000.
   */
  company_job_posting_quantity: rangeNum.optional(),

  /**
   * Filter by headcount within specific departments.
   * Max 10 department filters. Each entry: { department: string, min?: number, max?: number }
   */
  company_headcount_by_department: z
    .array(
      z.object({
        department: z.string(),
        min: z.number().int().optional(),
        max: z.number().int().optional(),
      })
    )
    .max(10)
    .optional(),

  /**
   * Filter by the email provider used by the company (e.g. "Google Workspace", "Microsoft 365").
   * Use the Search Suggestions API to enumerate valid provider strings.
   */
  company_email_provider: z.array(z.string()).optional(),
};

// ---------------------------------------------------------------------------
// search_person
// ---------------------------------------------------------------------------

export const SearchPersonSchema = z
  .object({
    filters: z
      .object({
        // ── Person-only filters ──────────────────────────────────────────

        /**
         * Filter by person's full name.
         * Max 500 items per include/exclude; each name 1–100 characters.
         */
        person_name: includeExcludeStr.optional(),

        /**
         * Free-text search across both person name AND job title fields.
         * Use when you want to match either field with a single query term.
         */
        person_name_or_job_title: z.string().optional(),

        /**
         * Filter by job title.
         * include/exclude: up to 100 job title strings.
         * match_only_exact_job_titles: true = exact match only (default false = fuzzy).
         * boolean_search: advanced query using AND / OR / NOT operators,
         *   e.g. "CTO OR (VP AND Engineering) NOT Intern"
         */
        person_job_title: z
          .object({
            include: z.array(z.string()).optional(),
            exclude: z.array(z.string()).optional(),
            match_only_exact_job_titles: z.boolean().optional(),
            boolean_search: z.string().optional(),
          })
          .optional(),

        /**
         * Filter by functional department.
         * Use the Search Suggestions API to enumerate valid department strings.
         * Example include values: "Engineering", "Sales", "Marketing", "Finance"
         */
        person_department: includeExcludeStr.optional(),

        /**
         * Filter by seniority level.
         * Valid values: "C-Suite", "Director", "VP", "Manager", "Head",
         * "Senior", "Junior", "Entry", "Partner", "Owner", "Intern"
         */
        person_seniority: z
          .object({
            include: z.array(z.string()).optional(),
            exclude: z.array(z.string()).optional(),
          })
          .optional(),

        /**
         * Filter by person's location (city, region, or country).
         * Values must be valid Prospeo locations — use the Search Suggestions API.
         * Example: include: ["New York, United States", "London, United Kingdom"]
         */
        person_location_search: includeExcludeStr.optional(),

        /**
         * Filter by whether the person has a verified email and/or mobile in Prospeo.
         * email: ["VERIFIED"] to require a verified email.
         * mobile: ["VERIFIED"] to require a verified mobile, ["UNAVAILABLE"] to exclude those without.
         * operator: "OR" (default) or "AND" — how email/mobile conditions are combined.
         * hide_people_with_details_already_revealed: skip contacts you've already looked up.
         */
        person_contact_details: z
          .object({
            email: z.array(z.string()).optional(),
            mobile: z.array(z.string()).optional(),
            operator: z.string().optional(),
            hide_people_with_details_already_revealed: z.boolean().optional(),
          })
          .optional(),

        /**
         * Cap on how many people from the same company are returned.
         * Useful to diversify results. Range: 1–100.
         */
        max_person_per_company: z.number().int().min(1).max(100).optional(),

        /**
         * Filter by total years of professional experience.
         * Min 0, max 60 years.
         */
        person_year_of_experience: rangeNum.optional(),

        /**
         * Filter by how long the person has held their current job title (in months).
         * Min 0, max 600 months.
         */
        person_time_in_current_role: rangeNum.optional(),

        /**
         * Filter by how long the person has been at their current company (in months).
         * Min 0, max 600 months.
         */
        person_time_in_current_company: rangeNum.optional(),

        /**
         * Filter for people who recently changed jobs.
         * timeframe_days: look-back window — allowed: 30, 60, 90, 180, 270, 365
         * only_promotion: true = only include job changes that were promotions
         * only_new_company: true = only include moves to a different company
         */
        person_job_change: z
          .object({
            timeframe_days: z.number().optional(),
            only_promotion: z.boolean().optional(),
            only_new_company: z.boolean().optional(),
          })
          .optional(),

        // ── Company filters (also available here to scope the company) ──
        ...CompanyFilters,
      })
      .describe(
        "All search filters. At least one positive (include) filter is required. " +
          "Mix person-specific filters (person_job_title, person_seniority, etc.) " +
          "with company filters (company_industry, company_headcount_range, etc.) to narrow results."
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
      "Returns up to 25 people per page (max 1000 pages). Costs 1 credit per search that returns results."
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
        "All company search filters. At least one positive (include) filter is required. " +
          "Use company_industry, company_headcount_range, company_location_search, company_technology, etc."
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
      "Returns up to 25 companies per page (max 1000 pages). Costs 1 credit per search that returns results."
  );

export type SearchCompanyInput = z.input<typeof SearchCompanySchema>;
