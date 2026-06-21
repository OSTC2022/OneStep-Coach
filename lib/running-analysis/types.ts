export type RunningAnalysisRaw = {
  distance_km?: number | null
  duration?: string | null
  pace?: string | null
  heart_rate?: number | null
  calories?: number | null
  activity_date?: string | null
  activity_time?: string | null
  activity_type?: string | null
  source_app?: string | null
  confidence?: number | null
  needs_review?: boolean | null
}

export type RunningAnalysisResult = {
  distance_km: number | null
  duration: string | null
  pace: string | null
  heart_rate: number | null
  calories: number | null
  activity_date: string | null
  activity_time: string | null
  activity_type: string | null
  source_app: string | null
  confidence: number
  needs_review: boolean
  extraction_method: 'ai' | 'ocr' | 'hybrid' | 'none'
  partial_failure: boolean
  missing_fields: string[]
  raw_text?: string
  raw_json?: Record<string, unknown>
}

export type RunningAnalysisDiagnostics = {
  openai_configured: boolean
  ai_status: 'skipped' | 'success' | 'empty' | 'failed' | 'timeout'
  ocr_status: 'skipped' | 'success' | 'empty' | 'failed' | 'timeout'
  field_count: number
}
