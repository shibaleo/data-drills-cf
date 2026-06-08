"use client"

import { useMemo } from "react"
import { useField } from "./use-field"

/**
 * Apply the global subject/level filter (from FieldContext) to a list.
 *
 * `fields` specifies the keys on each item that hold the subject/level ids.
 * Supports both snake_case (`subject_id`) and camelCase (`subjectId`) shapes.
 */
export function useSubjectLevelFilter<T>(
  items: T[],
  fields: { subject: keyof T; level: keyof T },
): T[] {
  const { filterSubjectId, filterLevelId } = useField()
  const subjectKey = fields.subject
  const levelKey = fields.level
  return useMemo(() => items.filter((item) => {
    if (filterSubjectId && item[subjectKey] !== filterSubjectId) return false
    if (filterLevelId && item[levelKey] !== filterLevelId) return false
    return true
  }), [items, filterSubjectId, filterLevelId, subjectKey, levelKey])
}
