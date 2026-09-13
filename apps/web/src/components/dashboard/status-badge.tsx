import * as React from "react";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const s = status || "";

  if (s.includes("Cancel") || s.toLowerCase().includes("cancel")) {
    return (
      <Badge variant="destructive" className={className}>
        Cancel
      </Badge>
    );
  }

  if (s.includes("(OL)") || s.toLowerCase().includes("online")) {
    return (
      <Badge
        variant="secondary"
        className={`bg-sky-500/10 text-sky-700 dark:text-sky-300 dark:bg-sky-500/20 border-sky-500/20 font-semibold ${className || ""}`}
      >
        Online
      </Badge>
    );
  }

  if (s.includes("(TM)") || s.toLowerCase().includes("tatap muka")) {
    return (
      <Badge
        variant="secondary"
        className={`bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/20 border-emerald-500/20 font-semibold ${className || ""}`}
      >
        Tatap Muka
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={className}>
      {status}
    </Badge>
  );
}
