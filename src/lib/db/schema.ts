/**
 * カノニカルな Drizzle スキーマは workspace package `@dd/db-schema` に集約。
 * このファイルはレガシ import path (`@/lib/db/schema`) の後方互換 re-export のみ。
 *
 * 新規コードは `@dd/db-schema` から直接 import する。
 */
export * from "@dd/db-schema";
