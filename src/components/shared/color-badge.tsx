export function ColorBadge({
  children,
  color,
  className = "",
}: {
  children: React.ReactNode;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${className}`}
      style={{
        borderColor: color,
        color,
        backgroundColor: color + "20",
      }}
    >
      {children}
    </span>
  );
}
