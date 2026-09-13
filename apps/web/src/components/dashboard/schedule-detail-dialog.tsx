"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./status-badge";
import { JadwalItem, formatDosenName } from "@/lib/types";
import {
  Building2,
  Calendar,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  DoorOpen,
  GraduationCap,
  Layers,
  User,
} from "lucide-react";
import { cn } from "cn";

interface ScheduleDetailDialogProps {
  item: JadwalItem | null;
  onClose: () => void;
}

function getGoogleCalendarUrl(item: JadwalItem): string {
  const title = encodeURIComponent(`${item.mataKuliah} (${item.kodeKelas})`);
  const details = encodeURIComponent(
    `Jadwal Kuliah UNAMA\nMata Kuliah: ${item.mataKuliah}\nKelas: ${item.kodeKelas}\nDosen: ${item.dosen}\nWaktu: ${item.hari}, ${item.tanggal} jam ${item.waktuMulai} WIB\nRuangan: ${item.ruangan} (${item.kampus})`
  );
  const location = encodeURIComponent(`${item.ruangan}, ${item.kampus}, UNAMA`);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
}

export function ScheduleDetailDialog({ item, onClose }: ScheduleDetailDialogProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (!item) return;
    const text = [
      `Jadwal Kuliah UNAMA`,
      `Mata Kuliah: ${item.mataKuliah}`,
      `Kelas: ${item.kodeKelas}`,
      `Dosen: ${item.dosen}`,
      `Waktu: ${item.hari}, ${item.tanggal} (${item.waktuMulai} WIB)`,
      `Lokasi: ${item.ruangan}, ${item.kampus}`,
      `Status: ${item.status}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg p-6">
        {item && (
          <div className="space-y-5">
            <DialogHeader className="space-y-1.5 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs font-semibold px-2 py-0.5">
                  {item.kodeKelas}
                </Badge>
                <StatusBadge status={item.status} />
              </div>
              <DialogTitle className="text-lg font-bold leading-snug text-foreground">
                {item.mataKuliah}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Informasi detail jadwal sesi perkuliahan atau laboratorium komputer UNAMA
              </DialogDescription>
            </DialogHeader>

            {/* Detailed Grid Information */}
            <div className="border border-border bg-muted/20 p-4 space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <User className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium text-muted-foreground text-[11px]">Dosen Pengampu</p>
                  <p className="text-sm font-semibold text-foreground">{formatDosenName(item.dosen)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-border/40">
                <div className="flex items-start gap-2.5">
                  <Calendar className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium text-muted-foreground text-[11px]">Hari & Tanggal</p>
                    <p className="font-medium text-foreground">{item.hari}</p>
                    <p className="text-[11px] text-muted-foreground">{item.tanggal}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Clock className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium text-muted-foreground text-[11px]">Waktu Mulai</p>
                    <p className="font-semibold text-foreground font-mono">{item.waktuMulai} WIB</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-border/40">
                <div className="flex items-start gap-2.5">
                  <DoorOpen className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium text-muted-foreground text-[11px]">Ruangan</p>
                    <p className="font-semibold text-foreground">{item.ruangan}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Building2 className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium text-muted-foreground text-[11px]">Kampus</p>
                    <p className="font-medium text-foreground">{item.kampus}</p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between gap-2 pt-1">
              <a
                href={getGoogleCalendarUrl(item)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-black text-white hover:bg-neutral-800 border border-neutral-900 dark:bg-black dark:text-white dark:border-neutral-700 dark:hover:bg-neutral-900 gap-1.5 h-9 text-xs font-medium shadow-xs"
                )}
              >
                <CalendarPlus className="size-3.5 text-white" />
                <span>+ Google Calendar</span>
              </a>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1.5 h-9 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-500" />
                    <span>Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5 text-muted-foreground" />
                    <span>Salin Info Jadwal</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
