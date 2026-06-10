-- =============================================================================
-- Phase 7: filter_pref を field 単位 → scope 単位に変更
--
-- 旧: (user_id, field_id) で 1 row。同 field の複数 scope は同じ UI prefs
-- 新: (user_id, scope_id) で 1 row。scope 毎に独立した UI prefs
--
-- 既存 row はマイグレーションコストが高いので drop (UI prefs は再構築可能)。
-- =============================================================================

BEGIN;

-- 1. 既存テーブルを drop して作り直し (data は捨てる)
DROP TABLE IF EXISTS data_drills.filter_pref;

-- scope は bitemporal append-only で primary key が (id, revision) のため、
-- FK 制約は付けない (goal_layer / goal_milestone と同じ方針)。
CREATE TABLE data_drills.filter_pref (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    scope_id    uuid NOT NULL,
    filters     jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX filter_pref_user_scope_key
    ON data_drills.filter_pref (user_id, scope_id);

COMMIT;
