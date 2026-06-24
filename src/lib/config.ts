/**
 * 非 secret の固定設定。git に commit して config = code として扱う。
 *
 * 区別:
 *  - ここ (config.ts): 公開 URL / 定数 / 単一値で済む固定値。rotation が稀。
 *    env var にすると `.dev.vars` と `wrangler.toml` の二重管理が発生するので避ける。
 *  - env.ts: secret / CF binding 由来 / 環境別に差し替えたい値。
 */
export const config = {
  /** data-warehouse GAS doPost endpoint。Clerk JWT で守る前提なので公開 URL。
   *  rotation は clasp deploy -i <deploymentId> で同一 ID に上書きする限り発生しない。 */
  warehouseSyncUrl: "https://script.google.com/macros/s/AKfycbxVkvdAtIibcTCeetD4t3pHqHrEy9CeXfrK42zI4Y4Q9sa9im9qSna5p1rJeDpuRf1m/exec",
} as const;
