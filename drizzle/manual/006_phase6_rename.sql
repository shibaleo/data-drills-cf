-- =============================================================================
-- Phase 6 (= option B): 内部 cosmetic rename
--
-- option C で温存していた「中身は field/review_type、列名は project_id/tag_id」
-- のずれを最後に綺麗にする。動作に影響しない、機械的 rename のみ。
--
-- 前提: 005 (Phase 4) 適用済。
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. *_scope (review/throughput/stats/digest) と filter_pref の project_id → field_id
-- -----------------------------------------------------------------------------

ALTER TABLE data_drills.filter_pref       RENAME COLUMN project_id TO field_id;
ALTER TABLE data_drills.review_scope      RENAME COLUMN project_id TO field_id;
ALTER TABLE data_drills.throughput_scope  RENAME COLUMN project_id TO field_id;
ALTER TABLE data_drills.stats_scope       RENAME COLUMN project_id TO field_id;
ALTER TABLE data_drills.digest_scope      RENAME COLUMN project_id TO field_id;

-- FK 制約名も rename
ALTER TABLE data_drills.filter_pref
  RENAME CONSTRAINT filter_pref_project_id_fk TO filter_pref_field_id_fk;
ALTER TABLE data_drills.review_scope
  RENAME CONSTRAINT review_scope_project_id_fk TO review_scope_field_id_fk;
ALTER TABLE data_drills.throughput_scope
  RENAME CONSTRAINT throughput_scope_project_id_fk TO throughput_scope_field_id_fk;
ALTER TABLE data_drills.stats_scope
  RENAME CONSTRAINT stats_scope_project_id_fk TO stats_scope_field_id_fk;
ALTER TABLE data_drills.digest_scope
  RENAME CONSTRAINT digest_scope_project_id_fk TO digest_scope_field_id_fk;

-- index 名 rename
ALTER INDEX data_drills.filter_pref_user_project_key
  RENAME TO filter_pref_user_field_key;
ALTER INDEX data_drills.review_scope_project_active_idx
  RENAME TO review_scope_field_active_idx;
ALTER INDEX data_drills.throughput_scope_project_active_idx
  RENAME TO throughput_scope_field_active_idx;
ALTER INDEX data_drills.stats_scope_project_active_idx
  RENAME TO stats_scope_field_active_idx;
ALTER INDEX data_drills.digest_scope_project_active_idx
  RENAME TO digest_scope_field_active_idx;

-- -----------------------------------------------------------------------------
-- 2. review_tag / flashcard_tag の tag_id → review_type_id
-- -----------------------------------------------------------------------------

ALTER TABLE data_drills.review_tag    RENAME COLUMN tag_id TO review_type_id;
ALTER TABLE data_drills.flashcard_tag RENAME COLUMN tag_id TO review_type_id;

-- FK 制約名は 005 で *_review_type_id_fk として作成済 → rename 不要

COMMIT;
