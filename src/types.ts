// ---------------------------------------------------------------------------
// Error framework
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | "validation"
  | "configuration"
  | "api_client_error"
  | "api_server_error"
  | "rate_limit"
  | "unknown";

export type ErrorSeverity = "low" | "medium" | "high" | "critical";

export interface ProspeoError {
  message: string;
  /** Prospeo API error_code (e.g. INSUFFICIENT_CREDITS) or internal code */
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: ProspeoError;
}

// ---------------------------------------------------------------------------
// Prospeo API — person & company shapes
// ---------------------------------------------------------------------------

export interface EmailInfo {
  status: "VERIFIED" | "UNVERIFIED";
  revealed: boolean;
  email: string;
  verification_method?: string;
  email_mx_provider?: string;
}

export interface MobileInfo {
  status: "VERIFIED" | null;
  revealed: boolean;
  mobile?: string;
  mobile_national?: string;
  mobile_international?: string;
  mobile_country?: string;
  mobile_country_code?: string;
}

export interface LocationInfo {
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  time_zone?: string;
  time_zone_offset?: number;
}

export interface JobHistoryEntry {
  title?: string;
  company_name?: string;
  current?: boolean;
  start_year?: number;
  start_month?: number;
  end_year?: number;
  end_month?: number;
  duration_in_months?: number;
  departments?: string[];
  seniority?: string;
  company_id?: string;
}

export interface PersonInfo {
  person_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  linkedin_url?: string;
  current_job_title?: string;
  current_job_key?: string;
  headline?: string;
  linkedin_member_id?: string;
  last_job_change_detected_at?: string;
  job_history: JobHistoryEntry[];
  mobile?: MobileInfo;
  email?: EmailInfo;
  location?: LocationInfo;
  skills: string[];
}

export interface RevenueRange {
  min?: number;
  max?: number;
}

export interface FundingInfo {
  total_raised?: number;
  last_round?: string;
  last_round_date?: string;
}

export interface CompanyInfo {
  company_id: string;
  name?: string;
  website?: string;
  domain?: string;
  other_websites: string[];
  description?: string;
  description_seo?: string;
  description_ai?: string;
  type?: string;
  industry?: string;
  employee_count?: number;
  employee_count_on_prospeo?: number;
  employee_range?: string;
  location?: LocationInfo;
  sic_codes: string[];
  naics_codes: string[];
  email_tech?: Record<string, unknown>;
  linkedin_url?: string;
  twitter_url?: string;
  facebook_url?: string;
  crunchbase_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  phone_hq?: {
    phone_hq?: string;
    phone_hq_national?: string;
    phone_hq_international?: string;
    phone_hq_country?: string;
    phone_hq_country_code?: string;
  };
  linkedin_id?: string;
  founded?: number;
  revenue_range?: RevenueRange;
  revenue_range_printed?: string;
  keywords: string[];
  logo_url?: string;
  attributes?: Record<string, unknown>;
  funding?: FundingInfo;
  technology?: Record<string, unknown>;
  job_postings?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Prospeo API — raw response shapes
// ---------------------------------------------------------------------------

export interface ProspeoAPIResponse {
  error: boolean;
  error_code?: string;
  filter_error?: string;
}

export interface EnrichPersonAPIResponse extends ProspeoAPIResponse {
  free_enrichment?: boolean;
  person?: PersonInfo;
  company?: CompanyInfo;
}

export interface EnrichCompanyAPIResponse extends ProspeoAPIResponse {
  free_enrichment?: boolean;
  company?: CompanyInfo;
}

export interface SearchPagination {
  current_page: number;
  per_page: number;
  total_page: number;
  total_count: number;
}

export interface SearchPersonResult {
  person: PersonInfo;
  company?: CompanyInfo;
}

export interface SearchPersonAPIResponse extends ProspeoAPIResponse {
  results: SearchPersonResult[];
  pagination: SearchPagination;
}

export interface SearchCompanyResult {
  company: CompanyInfo;
}

export interface SearchCompanyAPIResponse extends ProspeoAPIResponse {
  results: SearchCompanyResult[];
  pagination: SearchPagination;
}

export interface AccountInfoAPIResponse extends ProspeoAPIResponse {
  response: {
    current_plan: string;
    current_team_members: number;
    remaining_credits: number;
    used_credits: number;
    next_quota_renewal_days: number;
    next_quota_renewal_date: string;
  };
}
