export type ReviewType =
  | '質問' | '理解' | '確認' | '認知' | '混同'
  | '不理解' | '不作為' | '桁ミス' | '思考特性' | '問題傾向'
  | '符号ミス' | '問題文不読' | '足し算ミス' | 'Pending理解'
  | '期間数えミス' | '数字見間違い' | 'DONE' | '解答パターン'

export interface ProjectLevel {
  id: string
  project_id: string
  name: string
  color: string
  sort_order: number
}

export interface ProjectSubject {
  id: string
  project_id: string
  name: string
  color: string
  sort_order: number
}

export interface ProblemFile {
  id: string
  problem_id: string
  gdrive_file_id: string
  file_name: string
  problem_pages: number[] | null
  created_at: string
}

export interface Problem {
  id: string
  code: string
  name: string
  level_id: string
  subject_id: string
  checkpoint: string | null
  standard_time: number | null
  project_id: string
  created_at: string
  updated_at: string
  problem_files?: ProblemFile[]
}

export interface Answer {
  id: string
  date: string | null
  duration: string | null
  status: string | null
  /** Status point value (for dynamic forgetting-curve computation) */
  point?: number
  problem_id: string
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  content: string
  review_type: ReviewType | null
  answer_id: string
  created_at: string
  updated_at: string
}

export const REVIEW_TYPES: ReviewType[] = [
  '質問', '理解', '確認', '認知', '混同',
  '不理解', '不作為', '桁ミス', '思考特性', '問題傾向',
  '符号ミス', '問題文不読', '足し算ミス', 'Pending理解',
  '期間数えミス', '数字見間違い', 'DONE', '解答パターン',
]
