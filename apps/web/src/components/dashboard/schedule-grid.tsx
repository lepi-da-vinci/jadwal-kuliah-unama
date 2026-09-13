"use client";

import * as React from "react";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./status-badge";
import { JadwalItem, formatDosenName } from "@/lib/types";
import {
  Building2,
  Calendar,
  Clock,
  DoorOpen,
  GraduationCap,
  SearchX,
  User,
} from "lucide-react";

interface ScheduleGridProps {
  items: JadwalItem[];
  isLoading: boolean;
  onSelectItem: (item: JadwalItem) => void;
  onResetFilters?: () => void;
  selectedDate?: Date | null;
  className?: string;
}

export function ScheduleGrid({
  items,
  isLoading,
  onSelectItem,
  onResetFilters,
  selectedDate,
  className,
}: ScheduleGridProps) {
  if (isLoading) {
    return (
      <section
        aria-label="Daftar Jadwal Kuliah"
        className={cn(
          "relative border border-border bg-card p-4 sm:p-6 shadow-xs space-y-4",
          className
        )}
      >
        <div className="flex flex-col gap-3 pb-4 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3.5 w-72" />
          </div>
          <Skeleton className="h-8 w-40" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col justify-between gap-3 border border-border bg-card p-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <div className="space-y-2 pt-1">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section
        aria-label="Daftar Jadwal Kuliah"
        className={cn(
          "relative border border-border bg-card p-4 sm:p-6 shadow-xs space-y-4",
          className
        )}
      >
        <div className="flex flex-col gap-3 pb-4 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-[10px] font-semibold tracking-wide uppercase border-border bg-muted/60 text-foreground"
              >
                <GraduationCap className="size-3 mr-1 text-primary" />
                Sesi Perkuliahan
              </Badge>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              Jadwal Perkuliahan Mahasiswa
            </h3>
            <p className="text-xs text-muted-foreground">
              Daftar perkuliahan tatap muka dan online sesuai jadwal akademik aktif UNAMA.
            </p>
          </div>
        </div>

        <div className="border border-dashed border-border p-8 bg-muted/10 text-center">
          <Empty className="p-4">
            <EmptyMedia variant="icon">
              <SearchX className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-base font-semibold">
                {selectedDate
                  ? "Tidak Ada Jadwal pada Tanggal Ini"
                  : "Jadwal Tidak Ditemukan"}
              </EmptyTitle>
              <EmptyDescription className="text-xs max-w-md mx-auto mt-1">
                {selectedDate
                  ? "Tidak ditemukan sesi perkuliahan aktif untuk tanggal yang dipilih atau berada di luar kalender akademik semester aktif."
                  : "Tidak ada kelas yang cocok dengan kombinasi filter atau pencarian Anda."}
              </EmptyDescription>
            </EmptyHeader>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {onResetFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetFilters}
                  className="h-8 rounded-none text-xs"
                >
                  Tampilkan Semua Jadwal Semester
                </Button>
              )}
            </div>
          </Empty>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Daftar Jadwal Kuliah"
      className={cn(
        "relative border border-border bg-card p-4 sm:p-6 shadow-xs space-y-4",
        className
      )}
    >
      {/* Header Panel Jadwal Kuliah (Sinkron dengan gaya AslabRoomMonitor) */}
      <div className="flex flex-col gap-3 pb-4 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] font-semibold tracking-wide uppercase border-border bg-muted/60 text-foreground"
            >
              <GraduationCap className="size-3 mr-1 text-primary" />
              Sesi Perkuliahan
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">
              {items.length} Sesi Terdaftar
            </span>
          </div>
          <h3 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
            Jadwal Perkuliahan Mahasiswa
          </h3>
          <p className="text-xs text-muted-foreground">
            Daftar perkuliahan tatap muka dan online sesuai jadwal akademik aktif UNAMA.
          </p>
        </div>

        {/* Info Tanggal / Status di Sisi Kanan Header */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 border border-border/60 self-start sm:self-center font-medium">
          <Calendar className="size-3.5 text-primary shrink-0" />
          <span>
            {selectedDate
              ? selectedDate.toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "Semua Jadwal Perkuliahan"}
          </span>
        </div>
      </div>

      {/* Grid Kartu Jadwal */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectItem(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectItem(item);
              }
            }}
            className="group relative flex flex-col justify-between gap-3 border border-border bg-card p-4 text-left shadow-xs transition-all hover:border-primary/50 hover:shadow-sm hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            {/* Header Row: Jam Mulai, Kode Kelas, Status */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground bg-muted/60 px-2.5 py-0.5 border border-border">
                  <Clock className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{item.waktuMulai} WIB</span>
                </div>
                <div className="flex items-center font-mono text-[11px] font-bold px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/30 dark:bg-primary/20 dark:border-primary/40">
                  <span className="tracking-wider">{item.kodeKelas}</span>
                </div>
              </div>
              <StatusBadge status={item.status} className="text-[11px] px-2.5 py-0.5 h-auto" />
            </div>

            {/* Course Name & Lecturer */}
            <div className="space-y-1.5">
              <h3
                className="font-heading text-sm sm:text-base font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2"
                title={item.mataKuliah}
              >
                {item.mataKuliah}
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={item.dosen}>
                <User className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium text-foreground/90 truncate">{formatDosenName(item.dosen)}</span>
              </div>
            </div>

            {/* Clear & Legible Info Row: Hari, Tanggal, Ruangan, Kampus */}
            <div className="space-y-2 pt-2 border-t border-border text-xs">
              {/* Hari & Tanggal */}
              <div className="flex items-center gap-1.5 text-foreground font-medium">
                <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                <span>{item.hari}, {item.tanggal}</span>
              </div>

              {/* Ruangan & Lokasi Kampus */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <DoorOpen className="size-4 text-primary shrink-0" />
                  <span className="truncate">{item.ruangan}</span>
                </div>
                <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                  <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.kampus}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
