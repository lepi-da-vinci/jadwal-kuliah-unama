"use client";

import * as React from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarCheck, CalendarX, Laptop, Users } from "lucide-react";

interface StatsOverviewProps {
  totalJadwal: number;
  totalCancel?: number;
  totalOnline?: number;
  totalTatapMuka?: number;
  totalKampus?: number;
  totalRuangan?: number;
  selectedDate?: Date | null;
  selectedKampus?: string;
  selectedRuangan?: string;
  isLoading?: boolean;
}

export function StatsOverview({
  totalJadwal,
  totalCancel = 0,
  totalOnline = 0,
  totalTatapMuka = 0,
  selectedDate,
  selectedKampus,
  selectedRuangan,
  isLoading,
}: StatsOverviewProps) {
  const isDateActive = Boolean(selectedDate);
  const formattedDate = selectedDate
    ? format(selectedDate, "dd MMM yyyy", { locale: localeId })
    : null;

  let filterContext = "";
  if (selectedRuangan && selectedRuangan !== "Semua") {
    filterContext = ` di ${selectedRuangan}`;
  } else if (selectedKampus && selectedKampus !== "Semua") {
    filterContext = ` di ${selectedKampus}`;
  }

  const stats = [
    {
      title: "Total Sesi Jadwal",
      count: isLoading ? "..." : totalJadwal.toLocaleString("id-ID"),
      suffix: "Sesi",
      desc: isDateActive ? `Sesi pada ${formattedDate}${filterContext}` : `Jadwal aktif semester ini${filterContext}`,
      icon: CalendarCheck,
      iconClass: "bg-muted text-foreground/80 border-border/60 dark:border-transparent dark:text-muted-foreground",
      titleClass: "text-foreground",
      valueClass: "text-foreground",
    },
    {
      title: "Cancel",
      count: isLoading ? "..." : totalCancel.toLocaleString("id-ID"),
      suffix: "Sesi",
      desc: isDateActive ? `Dibatalkan pada ${formattedDate}${filterContext}` : `Sesi perkuliahan dibatalkan${filterContext}`,
      icon: CalendarX,
      iconClass: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
      titleClass: "text-red-600 dark:text-red-400",
      valueClass: "text-red-600 dark:text-red-400",
    },
    {
      title: "Online",
      count: isLoading ? "..." : totalOnline.toLocaleString("id-ID"),
      suffix: "Sesi",
      desc: isDateActive ? `Daring (OL) pada ${formattedDate}${filterContext}` : `Sesi perkuliahan daring (OL)${filterContext}`,
      icon: Laptop,
      iconClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
      titleClass: "text-sky-600 dark:text-sky-400",
      valueClass: "text-sky-600 dark:text-sky-400",
    },
    {
      title: "Tatap Muka",
      count: isLoading ? "..." : totalTatapMuka.toLocaleString("id-ID"),
      suffix: "Sesi",
      desc: isDateActive ? `Tatap muka pada ${formattedDate}${filterContext}` : `Sesi tatap muka di kampus${filterContext}`,
      icon: Users,
      iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      titleClass: "text-emerald-600 dark:text-emerald-400",
      valueClass: "text-emerald-600 dark:text-emerald-400",
    },
  ];

  const itemBorderClasses = [
    "border-r border-b lg:border-b-0 border-border",
    "border-b lg:border-b-0 lg:border-r border-border",
    "border-r border-border",
    "",
  ];

  return (
    <div className="grid grid-cols-2 border border-border bg-card shadow-xs lg:grid-cols-4">
      {stats.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={index}
            className={`flex flex-col justify-between p-2.5 sm:px-4 sm:py-3 hover:bg-muted/30 transition-colors ${itemBorderClasses[index] || ""}`}
          >
            <div className="flex items-center justify-between gap-1.5 mb-1">
              <span className={`text-xs sm:text-sm font-bold tracking-tight ${item.titleClass}`}>
                {item.title}
              </span>
              <div
                className={`flex size-6 sm:size-7 shrink-0 items-center justify-center border ${item.iconClass}`}
              >
                <Icon className="size-3.5" />
              </div>
            </div>

            <div className="flex items-baseline gap-1 my-0.5">
              <span className={`text-lg sm:text-2xl font-bold tracking-tight font-mono ${item.valueClass}`}>
                {item.count}
              </span>
              <span className={`text-[11px] sm:text-xs font-semibold ${item.valueClass} opacity-80`}>
                {item.suffix}
              </span>
            </div>

            <p className="text-[10.5px] sm:text-[11px] text-muted-foreground font-medium line-clamp-2 leading-tight min-h-[26px]">
              {item.desc}
            </p>
          </div>
        );
      })}
    </div>
  );
}
