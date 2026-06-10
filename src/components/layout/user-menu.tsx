"use client";

import { useState } from "react";
import { useAuth } from "@clerk/react";
import { Settings, LogOut } from "lucide-react";
import { useMe } from "@/components/auth/auth-gate";
import { cn } from "@/lib/utils";
import { UserSettingsDialog } from "./user-settings-dialog";

function Avatar({ name, className }: { name: string; className?: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        "flex shrink-0 size-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold",
        className,
      )}
    >
      {initial}
    </div>
  );
}

/**
 * /scopes と同じ edge nav 流儀。avatar をハブにして hover で上半円に 2 sector
 * (Settings, Logout) を扇状展開する。geometry は scopes の縮小版。
 */
const SECTORS = [
  { startDeg: -170, endDeg: -95, label: "Settings", icon: Settings, color: "#846ce5", action: "settings" as const },
  { startDeg: -85, endDeg: -10, label: "Logout", icon: LogOut, color: "#da5865", action: "logout" as const },
];

const INNER_R = 28;
const OUTER_R = 56;
const GAP_DEG = 4;

function annularSector(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
  cornerRadius = 4,
): string {
  const a1 = (startDeg * Math.PI) / 180;
  const a2 = (endDeg * Math.PI) / 180;
  const ptOn = (R: number, ang: number): [number, number] => [
    cx + R * Math.cos(ang),
    cy + R * Math.sin(ang),
  ];
  const r = Math.min(cornerRadius, (outerR - innerR) / 2 - 0.5);
  const v1 = ptOn(outerR, a1);
  const v2 = ptOn(outerR, a2);
  const v3 = ptOn(innerR, a2);
  const v4 = ptOn(innerR, a1);
  const v1in = ptOn(outerR - r, a1);
  const v1out = ptOn(outerR, a1 + r / outerR);
  const v2in = ptOn(outerR, a2 - r / outerR);
  const v2out = ptOn(outerR - r, a2);
  const v3in = ptOn(innerR + r, a2);
  const v3out = ptOn(innerR, a2 - r / innerR);
  const v4in = ptOn(innerR, a1 + r / innerR);
  const v4out = ptOn(innerR + r, a1);
  const q = (vx: [number, number], op: [number, number]) =>
    `Q ${vx[0]} ${vx[1]} ${op[0]} ${op[1]}`;
  return [
    `M ${v1in[0]} ${v1in[1]}`,
    q(v1, v1out),
    `A ${outerR} ${outerR} 0 0 1 ${v2in[0]} ${v2in[1]}`,
    q(v2, v2out),
    `L ${v3in[0]} ${v3in[1]}`,
    q(v3, v3out),
    `A ${innerR} ${innerR} 0 0 0 ${v4in[0]} ${v4in[1]}`,
    q(v4, v4out),
    "Z",
  ].join(" ");
}

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { me } = useMe();
  const { isSignedIn, signOut } = useAuth();
  const [hoveredSec, setHoveredSec] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleLogout() {
    setOpen(false);
    await fetch("/api/v1/auth/logout", { method: "POST" });
    if (isSignedIn) await signOut();
    window.location.href = "/";
  }

  function onSectorClick(action: "settings" | "logout") {
    setOpen(false);
    if (action === "settings") setSettingsOpen(true);
    else handleLogout();
  }

  // SVG canvas: avatar 位置 (cx, cy) を bottom-center に置いて上半円に sector を展開。
  const W = 2 * OUTER_R + 16; // 余白込み
  const H = OUTER_R + 8;
  const cx = W / 2;
  const cy = H; // avatar の中心位置 (svg 下端)

  return (
    <>
      <div
        className="relative border-t border-sidebar-border px-3 py-3"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { setOpen(false); setHoveredSec(null); }}
      >
        {/* Floating wheel (avatar 上に展開) */}
        <div
          aria-hidden={!open}
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 transition-opacity duration-200"
          style={{
            bottom: `calc(100% - 24px)`,
            opacity: open ? 1 : 0,
            width: W,
            height: H,
          }}
        >
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="pointer-events-auto overflow-visible"
            style={{ display: open ? "block" : "none" }}
          >
            {SECTORS.map((sec) => {
              const adjStart = sec.startDeg + GAP_DEG / 2;
              const adjEnd = sec.endDeg - GAP_DEG / 2;
              const isHover = hoveredSec === sec.action;
              const outerR = OUTER_R + (isHover ? 4 : 0);
              const path = annularSector(cx, cy, INNER_R, outerR, adjStart, adjEnd, 4);
              const textR = (INNER_R + outerR) / 2;
              const aStart = (adjStart * Math.PI) / 180;
              const aEnd = (adjEnd * Math.PI) / 180;
              const p1x = cx + textR * Math.cos(aStart);
              const p1y = cy + textR * Math.sin(aStart);
              const p2x = cx + textR * Math.cos(aEnd);
              const p2y = cy + textR * Math.sin(aEnd);
              // 上半円なので時計回り (sweep=1) で baseline 走らせる
              const textArc = `M ${p1x} ${p1y} A ${textR} ${textR} 0 0 1 ${p2x} ${p2y}`;
              const arcId = `usermenu-arc-${sec.action}`;
              return (
                <g
                  key={sec.action}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredSec(sec.action)}
                  onMouseLeave={() => setHoveredSec(null)}
                  onClick={() => onSectorClick(sec.action)}
                >
                  <path
                    d={path}
                    fill={isHover ? "var(--background)" : sec.color}
                    stroke={isHover ? "transparent" : sec.color}
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                    style={{
                      transition: "fill 140ms, stroke 140ms, d 160ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 160ms",
                      filter: isHover
                        ? `drop-shadow(0 0 6px ${sec.color}) drop-shadow(0 0 14px ${sec.color})`
                        : "none",
                    }}
                  />
                  <path id={arcId} d={textArc} fill="none" stroke="none" />
                  <text
                    fontSize={11}
                    fontWeight={900}
                    fill={isHover ? sec.color : "white"}
                    letterSpacing={0.4}
                    dominantBaseline="central"
                    style={{ transition: "fill 140ms ease-out" }}
                    className="pointer-events-none select-none"
                  >
                    <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
                      {sec.label}
                    </textPath>
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Avatar trigger (常時表示) */}
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md p-1 -m-1 transition-colors hover:bg-sidebar-accent"
        >
          <Avatar name={me.name} />
          <span
            className={cn(
              "truncate text-sm text-sidebar-foreground whitespace-nowrap transition-opacity duration-200",
              collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100",
            )}
          >
            {me.name}
          </span>
        </button>
      </div>

      <UserSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
