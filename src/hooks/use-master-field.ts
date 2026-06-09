"use client";

import { useState, useEffect, useCallback } from "react";
import { useField } from "@/hooks/use-field";
import type { Field } from "@/hooks/queries/use-field-data";

const MASTER_FIELD_LS_KEY = "dd_master_field_id";

/**
 * Page-local field picker state for master CRUD / new-scope creation pages.
 * Backed by localStorage (per-user UI state). Returns the selected Field or
 * null while fields are still loading.
 */
export function useMasterField(): {
  fields: Field[];
  field: Field | null;
  setField: (f: Field) => void;
} {
  const { fields } = useField();
  const [fieldId, setFieldId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(MASTER_FIELD_LS_KEY) : null,
  );

  useEffect(() => {
    if (fieldId || fields.length === 0) return;
    setFieldId(fields[0].id);
  }, [fields, fieldId]);

  const setField = useCallback((f: Field) => {
    setFieldId(f.id);
    if (typeof window !== "undefined") {
      localStorage.setItem(MASTER_FIELD_LS_KEY, f.id);
    }
  }, []);

  const field = fields.find((f) => f.id === fieldId) ?? null;
  return { fields, field, setField };
}
