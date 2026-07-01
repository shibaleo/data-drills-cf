/**
 * AG Grid theme + module registration の共通化。
 * data-drills 内では必ずここを import して使う (直接 ag-grid-community を触らない)。
 */

import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export const agGridTheme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
  rowHeight: 28,
  headerHeight: 30,
  cellHorizontalPadding: 10,
  borderRadius: 6,
  backgroundColor: "hsl(var(--card))",
  foregroundColor: "hsl(var(--foreground))",
  headerBackgroundColor: "hsl(var(--muted))",
  headerTextColor: "hsl(var(--foreground))",
  borderColor: "hsl(var(--border))",
  wrapperBorder: { color: "hsl(var(--border))", style: "solid", width: 1 },
  rowHoverColor: "hsl(var(--accent) / 0.5)",
  selectedRowBackgroundColor: "hsl(var(--accent))",
  oddRowBackgroundColor: "hsl(var(--card))",
  chromeBackgroundColor: "hsl(var(--muted))",
  inputBackgroundColor: "hsl(var(--background))",
  inputBorder: { color: "hsl(var(--border))", style: "solid", width: 1 },
});
