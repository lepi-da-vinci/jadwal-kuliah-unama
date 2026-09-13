"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { JadwalItem, formatDosenName } from "@/lib/types";
import { SearchX } from "lucide-react";

interface ScheduleTableProps {
  items: JadwalItem[];
  isLoading: boolean;
  onSelectItem: (item: JadwalItem) => void;
  onResetFilters?: () => void;
  selectedDate?: Date | null;
}

function parseStatusAndMethod(rawStatus: string) {
  if (rawStatus.includes("(TM)")) {
    return { status: "Tatap Muka", method: "TM" };
  }
  if (rawStatus.includes("(OL)")) {
    return { status: "Online", method: "OL" };
  }
  if (rawStatus.includes("Cancel")) {
    return { status: "Cancel", method: "-" };
  }
  return { status: rawStatus, method: "-" };
}

export function ScheduleTable({
  items,
  isLoading,
  onSelectItem,
  onResetFilters,
  selectedDate,
}: ScheduleTableProps) {
  if (isLoading) {
    return (
      <div className="overflow-hidden border border-border bg-card shadow-xs">
        <div className="p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3.5 border-b border-border/40 last:border-0">
              <Skeleton className="h-8 w-[16%]" />
              <Skeleton className="h-10 w-[32%]" />
              <Skeleton className="h-6 w-[23%]" />
              <Skeleton className="h-6 w-[16%]" />
              <Skeleton className="h-6 w-[8%]" />
              <Skeleton className="h-6 w-[5%]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border border-dashed border-border p-8 bg-card text-center shadow-xs">
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
    );
  }

  return (
    <div className="overflow-hidden border border-border bg-card shadow-xs">
      <div className="relative w-full">
        <Table className="table-fixed w-full">
          <TableHeader className="bg-muted/40 border-b border-border">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6 w-[16%] font-semibold text-xs text-foreground uppercase tracking-wider">
                Waktu
              </TableHead>
              <TableHead className="w-[32%] font-semibold text-xs text-foreground uppercase tracking-wider">
                Mata Kuliah
              </TableHead>
              <TableHead className="w-[23%] font-semibold text-xs text-foreground uppercase tracking-wider">
                Dosen
              </TableHead>
              <TableHead className="w-[16%] font-semibold text-xs text-foreground uppercase tracking-wider">
                Ruangan
              </TableHead>
              <TableHead className="w-[8%] font-semibold text-xs text-foreground uppercase tracking-wider">
                Status
              </TableHead>
              <TableHead className="pr-6 w-[5%] font-semibold text-xs text-foreground uppercase tracking-wider">
                Metode
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const { status, method } = parseStatusAndMethod(item.status);
              const kampusShort = item.kampus.replace("Kampus ", "");

              return (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors border-b border-border/60 last:border-0"
                  onClick={() => onSelectItem(item)}
                >
                  {/* Kolom 1: WAKTU */}
                  <TableCell className="pl-6 py-3.5 align-top whitespace-normal">
                    <div className="font-mono text-sm font-bold text-foreground">
                      {item.waktuMulai}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {item.hari}, {item.tanggal}
                    </div>
                  </TableCell>

                  {/* Kolom 2: MATA KULIAH (Turun ke bawah / wrap) */}
                  <TableCell className="py-3.5 align-top whitespace-normal">
                    <div className="font-semibold text-sm text-foreground leading-snug break-words whitespace-normal">
                      {item.mataKuliah}
                    </div>
                    <div className="mt-1">
                      <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        (Kelas: {item.kodeKelas})
                      </span>
                    </div>
                  </TableCell>

                  {/* Kolom 3: DOSEN (Turun ke bawah / wrap) */}
                  <TableCell className="py-3.5 text-xs text-foreground/90 font-medium align-top whitespace-normal">
                    <div className="leading-snug break-words whitespace-normal">
                      {formatDosenName(item.dosen)}
                    </div>
                  </TableCell>

                  {/* Kolom 4: RUANGAN (Turun ke bawah / wrap) */}
                  <TableCell className="py-3.5 text-xs font-medium text-foreground align-top whitespace-normal">
                    <div className="leading-snug break-words whitespace-normal">
                      {item.ruangan} ({kampusShort})
                    </div>
                  </TableCell>

                  {/* Kolom 5: STATUS */}
                  <TableCell className="py-3.5 text-xs font-medium text-foreground whitespace-nowrap align-top">
                    {status}
                  </TableCell>

                  {/* Kolom 6: METODE */}
                  <TableCell className="pr-6 py-3.5 whitespace-nowrap align-top">
                    {method === "TM" && (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/20 border-emerald-500/20 font-bold px-2 py-0.5 text-[11px]"
                      >
                        TM
                      </Badge>
                    )}
                    {method === "OL" && (
                      <Badge
                        variant="secondary"
                        className="bg-sky-500/10 text-sky-700 dark:text-sky-300 dark:bg-sky-500/20 border-sky-500/20 font-bold px-2 py-0.5 text-[11px]"
                      >
                        OL
                      </Badge>
                    )}
                    {method === "-" && (
                      <span className="text-muted-foreground font-mono text-xs">-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
