import { Loader2 } from "lucide-react";

export function Spinner({ className = "", label }: { className?: string; label?: string }) {
  return (
    <Loader2
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`size-4 animate-spin ${className}`}
    />
  );
}
