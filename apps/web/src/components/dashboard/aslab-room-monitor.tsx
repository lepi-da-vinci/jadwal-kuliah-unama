"use client";

import * as React from "react";
import { cn } from "cn";
import {
  Clock,
  DoorOpen,
  DoorClosed,
  Building2,
  User,
  Calendar,
  Info,
  Timer,
  Radio,
  Layers,
  Search,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./status-badge";
import {
  calculateLabGaps,
  getInUseRooms,
  getLabCaretaker,
  UNAMA_LABS,
} from "@/lib/lab-utils";
import { JadwalItem, formatDosenName } from "@/lib/types";

interface AslabRoomMonitorProps {
  items: JadwalItem[];
  selectedDate?: Date | null;
  onSelectItem?: (item: JadwalItem) => void;
  className?: string;
}

export function AslabRoomMonitor({
  items,
  selectedDate,
  onSelectItem,
  className,
}: AslabRoomMonitorProps) {
  // Mode tampilan: "terpakai" (In-Use Cards) vs "jeda_kosong" (Empty Gaps)
  const [activeTab, setActiveTab] = React.useState<"terpakai" | "jeda_kosong">("terpakai");
  const [selectedKampus, setSelectedKampus] = React.useState<string>("Semua");
  const [filterType, setFilterType] = React.useState<"all" | "lab_only">("lab_only");
  const [searchRoom, setSearchRoom] = React.useState<string>("");
  const [currentTimeWib, setCurrentTimeWib] = React.useState<string>("");

  // Update jam real-time setiap 30 detik
  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
      });
      setCurrentTimeWib(formatted);
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Hitung ruang yang sedang dipakai
  const { activeNow, allTodayUsed } = React.useMemo(() => {
    return getInUseRooms(items, currentTimeWib);
  }, [items, currentTimeWib]);

  // Ambil daftar ruangan yang ada di data
  const allKnownRooms = React.useMemo(() => {
    const fromItems = items.map((i) => i.ruangan).filter(Boolean);
    return Array.from(new Set([...UNAMA_LABS, ...fromItems]));
  }, [items]);

  // Hitung seluruh jeda kosong
  const labGaps = React.useMemo(() => {
    return calculateLabGaps(items, allKnownRooms, selectedKampus);
  }, [items, allKnownRooms, selectedKampus]);

  // Filter daftar ruang terpakai
  const filteredUsedRooms = React.useMemo(() => {
    return allTodayUsed.filter((r) => {
      if (selectedKampus !== "Semua" && r.kampus !== selectedKampus) return false;
      if (filterType === "lab_only" && !r.isLabor) return false;
      if (
        searchRoom.trim() &&
        !r.ruangan.toLowerCase().includes(searchRoom.toLowerCase()) &&
        !r.mataKuliah.toLowerCase().includes(searchRoom.toLowerCase()) &&
        !r.dosen.toLowerCase().includes(searchRoom.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [allTodayUsed, selectedKampus, filterType, searchRoom]);

  // Pisahkan antara lab terpakai dan ruangan kelas biasa
  const usedLabs = React.useMemo(() => {
    return filteredUsedRooms.filter((r) => r.isLabor);
  }, [filteredUsedRooms]);

  const usedTheoryRooms = React.useMemo(() => {
    return filteredUsedRooms.filter((r) => !r.isLabor);
  }, [filteredUsedRooms]);

  // Filter daftar jeda kosong
  const filteredGaps = React.useMemo(() => {
    return labGaps.filter((gap) => {
      if (filterType === "lab_only" && !gap.isLabor) return false;
      if (
        searchRoom.trim() &&
        !gap.ruangan.toLowerCase().includes(searchRoom.toLowerCase()) &&
        !gap.formattedText.toLowerCase().includes(searchRoom.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [labGaps, filterType, searchRoom]);

  // Hitung jumlah lab yang sedang aktif saat ini
  const activeLabsNowCount = activeNow.filter((r) => r.isLabor).length;

  return (
    <section
      aria-label="Panel Asisten Laboratorium"
      className={cn(
        "relative border border-primary/30 bg-card p-3.5 sm:p-6 shadow-xs",
        className
      )}
    >
      {/* Header Panel Aslab */}
      <div className="flex flex-col gap-3 pb-3 sm:pb-4 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] font-semibold tracking-wide uppercase border-primary/40 bg-primary/10 text-primary"
            >
              <ShieldCheck className="size-3 mr-1" />
              Panel Monitoring Aslab
            </Badge>
          </div>
          <h3 className="text-base sm:text-xl font-bold tracking-tight text-foreground leading-snug">
            Status Penggunaan Ruang & Laboratorium
          </h3>
          <p className="text-xs text-muted-foreground">
            Informasi real-time ruang kelas dan laboratorium aktif serta estimasi jeda waktu kosong.
          </p>
        </div>

        {/* Quick Tabs & Action Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 sm:pt-0">
          <Button
            variant={activeTab === "terpakai" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("terpakai")}
            className="h-8 gap-1.5 cursor-pointer text-xs rounded-none justify-center"
          >
            <DoorClosed className="size-3.5" />
            <span>Ruang Terpakai ({filteredUsedRooms.length})</span>
          </Button>

          <Button
            variant={activeTab === "jeda_kosong" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("jeda_kosong")}
            className="h-8 gap-1.5 cursor-pointer text-xs rounded-none border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 justify-center"
          >
            <Timer className="size-3.5 text-emerald-500" />
            <span className="font-semibold">Cek Jeda & Ruang Kosong ({filteredGaps.length})</span>
          </Button>
        </div>
      </div>

      {/* Sub-Filters: Kampus, Tipe Ruang, Pencarian */}
      <div className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-muted-foreground text-[11px] font-medium mr-0.5">Filter:</span>
          {["Semua", "Kampus Thehok", "Kampus Kobar"].map((kp) => (
            <button
              key={kp}
              type="button"
              onClick={() => setSelectedKampus(kp)}
              className={cn(
                "px-2 sm:px-2.5 py-1 text-xs border transition-colors cursor-pointer rounded-none",
                selectedKampus === kp
                  ? "border-primary bg-primary text-primary-foreground font-medium"
                  : "border-border bg-background hover:bg-muted text-muted-foreground"
              )}
            >
              {kp}
            </button>
          ))}

          <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={() => setFilterType(filterType === "lab_only" ? "all" : "lab_only")}
            className={cn(
              "px-2 sm:px-2.5 py-1 text-xs border transition-colors cursor-pointer flex items-center gap-1 rounded-none",
              filterType === "lab_only"
                ? "border-primary/60 bg-primary/10 text-primary font-medium"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            <Layers className="size-3" />
            {filterType === "lab_only" ? "Khusus Lab" : "Semua Ruangan"}
          </button>
        </div>

        {/* Input Pencarian Ruangan */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            value={searchRoom}
            onChange={(e) => setSearchRoom(e.target.value)}
            placeholder="Cari ruang / matkul..."
            className="pl-7 h-8 sm:h-7 text-xs rounded-none"
          />
        </div>
      </div>

      {/* KONTEN TAB 1: CARD RUANG TERPAKAI (SINKRON DENGAN SCHEDULE-GRID.TSX) */}
      {activeTab === "terpakai" && (
        <div className="pt-4 space-y-6">
          {/* Quick Summary Pill Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 border border-border bg-muted/20">
              <span className="text-muted-foreground text-[11px] block">Lab Sedang Berlangsung</span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {activeLabsNowCount} Lab Aktif
              </span>
            </div>
            <div className="p-2.5 border border-border bg-muted/20">
              <span className="text-muted-foreground text-[11px] block">Total Lab Terpakai Hari Ini</span>
              <span className="text-base font-bold text-foreground">
                {usedLabs.length} Sesi Lab
              </span>
            </div>
            <div className="p-2.5 border border-border bg-muted/20">
              <span className="text-muted-foreground text-[11px] block">Ruang Kelas Teori Terpakai</span>
              <span className="text-base font-bold text-foreground">
                {usedTheoryRooms.length} Kelas
              </span>
            </div>
            <div className="p-2.5 border border-border bg-muted/20">
              <span className="text-muted-foreground text-[11px] block">Jeda Waktu Terbuka</span>
              <span className="text-base font-bold text-primary">
                {filteredGaps.length} Slot Kosong
              </span>
            </div>
          </div>

          {/* Section 1: Laboratorium Sedang Dipakai */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-primary animate-pulse" />
                <h4 className="text-sm font-semibold text-foreground">
                  Laboratorium Komputer Terpakai ({usedLabs.length})
                </h4>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {usedLabs.filter((l) => l.isLiveNow).length} Sedang Berjalan Sekarang
              </span>
            </div>

            {usedLabs.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-border bg-muted/10 text-xs text-muted-foreground">
                <DoorOpen className="size-6 mx-auto mb-2 opacity-50" />
                Tidak ada laboratorium yang sedang terpakai pada kriteria ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {usedLabs.map((room) => {
                  const rawItem = room.rawItem || {
                    id: room.id,
                    hari: "Hari Ini",
                    tanggal: selectedDate ? selectedDate.toLocaleDateString("id-ID") : "Aktif",
                    waktuMulai: room.waktuMulai,
                    dosen: room.dosen,
                    kodeKelas: room.kodeKelas,
                    mataKuliah: room.mataKuliah,
                    kampus: room.kampus,
                    ruangan: room.ruangan,
                    status: room.status,
                  };

                  return (
                    <div
                      key={room.id}
                      role={onSelectItem ? "button" : undefined}
                      tabIndex={onSelectItem ? 0 : undefined}
                      onClick={() => onSelectItem && onSelectItem(rawItem)}
                      onKeyDown={(e) => {
                        if (onSelectItem && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          onSelectItem(rawItem);
                        }
                      }}
                      className={cn(
                        "group relative flex flex-col justify-between gap-3 border bg-card p-4 text-left shadow-xs transition-all",
                        onSelectItem ? "cursor-pointer hover:border-primary/50 hover:shadow-sm hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "",
                        room.isLiveNow
                          ? "border-emerald-500/60 ring-1 ring-emerald-500/30"
                          : "border-border"
                      )}
                    >
                      {/* Header Row: Jam Mulai, Kode Kelas, Status (Sinkron persis dengan ScheduleGrid) */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground bg-muted/60 px-2.5 py-0.5 border border-border">
                            <Clock className="size-3.5 text-muted-foreground shrink-0" />
                            <span>{room.waktuMulai} - {room.waktuSelesai} WIB</span>
                          </div>
                          <div className="flex items-center font-mono text-[11px] font-bold px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/30 dark:bg-primary/20 dark:border-primary/40">
                            <span className="tracking-wider">{room.kodeKelas}</span>
                          </div>
                        </div>

                        {room.isLiveNow ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 bg-emerald-500 text-white dark:bg-emerald-600">
                            <span className="size-1.5 rounded-full bg-white animate-ping" />
                            LIVE
                          </span>
                        ) : (
                          <StatusBadge status={room.status} className="text-[11px] px-2.5 py-0.5 h-auto" />
                        )}
                      </div>

                      {/* Course Name & Lecturer (Sinkron persis dengan ScheduleGrid) */}
                      <div className="space-y-1.5">
                        <h3
                          className="font-heading text-sm sm:text-base font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2"
                          title={room.mataKuliah}
                        >
                          {room.mataKuliah}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={room.dosen}>
                          <User className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium text-foreground/90 truncate">{formatDosenName(room.dosen)}</span>
                        </div>
                      </div>

                      {/* Info Row: Status Live / Hari & Ruangan / Kampus (Sinkron persis dengan ScheduleGrid) */}
                      <div className="space-y-2 pt-2 border-t border-border text-xs">
                        <div className="flex items-center justify-between gap-2 text-foreground font-medium">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                            <span>{rawItem.hari}, {rawItem.tanggal}</span>
                          </div>
                          {room.isLiveNow && (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Sedang Digunakan
                            </span>
                          )}
                        </div>

                        {/* Ruangan & Lokasi Kampus */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <DoorOpen className="size-4 text-primary shrink-0" />
                            <span className="truncate">{room.ruangan}</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{room.kampus}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Ruang Kelas Teori (Jika tidak dibatasi ke lab only) */}
          {filterType === "all" && usedTheoryRooms.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  Ruang Kelas Teori Terpakai ({usedTheoryRooms.length})
                </h4>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {usedTheoryRooms.map((room) => {
                  const rawItem = room.rawItem || {
                    id: room.id,
                    hari: "Hari Ini",
                    tanggal: selectedDate ? selectedDate.toLocaleDateString("id-ID") : "Aktif",
                    waktuMulai: room.waktuMulai,
                    dosen: room.dosen,
                    kodeKelas: room.kodeKelas,
                    mataKuliah: room.mataKuliah,
                    kampus: room.kampus,
                    ruangan: room.ruangan,
                    status: room.status,
                  };

                  return (
                    <div
                      key={room.id}
                      role={onSelectItem ? "button" : undefined}
                      tabIndex={onSelectItem ? 0 : undefined}
                      onClick={() => onSelectItem && onSelectItem(rawItem)}
                      onKeyDown={(e) => {
                        if (onSelectItem && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          onSelectItem(rawItem);
                        }
                      }}
                      className={cn(
                        "group relative flex flex-col justify-between gap-3 border border-border bg-card p-4 text-left shadow-xs transition-all",
                        onSelectItem ? "cursor-pointer hover:border-primary/50 hover:shadow-sm hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground bg-muted/60 px-2.5 py-0.5 border border-border">
                            <Clock className="size-3.5 text-muted-foreground shrink-0" />
                            <span>{room.waktuMulai} - {room.waktuSelesai} WIB</span>
                          </div>
                          <div className="flex items-center font-mono text-[11px] font-bold px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/30 dark:bg-primary/20 dark:border-primary/40">
                            <span className="tracking-wider">{room.kodeKelas}</span>
                          </div>
                        </div>
                        <StatusBadge status={room.status} className="text-[11px] px-2.5 py-0.5 h-auto" />
                      </div>

                      <div className="space-y-1.5">
                        <h3
                          className="font-heading text-sm sm:text-base font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2"
                          title={room.mataKuliah}
                        >
                          {room.mataKuliah}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={room.dosen}>
                          <User className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium text-foreground/90 truncate">{formatDosenName(room.dosen)}</span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border text-xs">
                        <div className="flex items-center gap-1.5 text-foreground font-medium">
                          <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                          <span>{rawItem.hari}, {rawItem.tanggal}</span>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <DoorOpen className="size-4 text-primary shrink-0" />
                            <span className="truncate">{room.ruangan}</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{room.kampus}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* KONTEN TAB 2: INFORMASI JEDA RUANG LABOR KOSONG (SINKRON PERSIS DENGAN VISUAL SCHEDULE-GRID) */}
      {activeTab === "jeda_kosong" && (
        <div className="pt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs">
            <div className="flex items-center gap-2">
              <Info className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p>
                <strong>Daftar Jeda Ruangan Kosong:</strong> Waktu senggang antar sesi perkuliahan untuk pemeliharaan, praktikum mandiri, atau kegiatan aslab.
              </p>
            </div>
            <span className="font-mono text-[11px] shrink-0 font-medium">
              Kobar: s/d 17:00 WIB • Thehok: s/d Selesai
            </span>
          </div>

          {filteredGaps.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-border text-xs text-muted-foreground">
              Tidak ditemukan jeda kosong pada filter yang dipilih.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGaps.map((gap) => (
                <div
                  key={gap.id}
                  className="group relative flex flex-col justify-between gap-3 border border-border bg-card p-4 text-left shadow-xs transition-all hover:border-emerald-500/60 hover:shadow-sm hover:bg-muted/15"
                >
                  {/* Header Row: Jam Rentang Kosong di Kiri, Badge Jeda di Kanan (Konsisten 1 Baris Rapi) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground bg-muted/60 px-2.5 py-0.5 border border-border shrink-0">
                      <Clock className="size-3.5 text-muted-foreground shrink-0" />
                      <span>{gap.waktuMulai} - {gap.waktuSelesai} WIB</span>
                    </div>
                    <div className="flex items-center font-mono text-[11px] font-bold px-2.5 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
                      <Timer className="size-3 text-emerald-600 dark:text-emerald-400 mr-1 shrink-0" />
                      <span className="tracking-wider">JEDA {gap.totalJamText.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Title & Subtitle: Ringkas dan Informatif (Sinkron dengan ScheduleGrid) */}
                  <div className="space-y-1.5">
                    <h3
                      className="font-heading text-sm sm:text-base font-semibold leading-snug text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1"
                      title={gap.formattedText}
                    >
                      {gap.ruangan.toLowerCase().startsWith("labor") || gap.ruangan.toLowerCase().startsWith("ruang")
                        ? gap.ruangan
                        : `Ruang ${gap.ruangan}`}
                    </h3>
                    <div className="text-xs text-muted-foreground space-y-0.5 min-h-[36px]">
                      {gap.tipeJeda === "seharian_kosong" ? (
                        <>
                          <div className="truncate">Kosong seharian</div>
                          <div className="truncate text-foreground/80">Lab tutup {gap.waktuSelesai} WIB</div>
                        </>
                      ) : gap.tipeJeda === "antar_kelas" ? (
                        <>
                          <div className="truncate">
                            {gap.sebelumKelas?.rawItem && onSelectItem ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectItem(gap.sebelumKelas!.rawItem!);
                                }}
                                className="group/btn inline-flex items-center gap-1 text-left hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline cursor-pointer transition-colors max-w-full"
                                title={`Buka detail kelas: ${gap.sebelumKelas.mataKuliah} (${gap.sebelumKelas.dosen})`}
                              >
                                <span className="truncate">
                                  Setelah <strong className="font-medium text-foreground/90 group-hover/btn:text-emerald-600 dark:group-hover/btn:text-emerald-400">{gap.sebelumKelas.mataKuliah}</strong>
                                </span>
                                <ExternalLink className="size-2.5 shrink-0 opacity-60 group-hover/btn:opacity-100" />
                              </button>
                            ) : (
                              <span title={`Setelah ${gap.sebelumKelas?.mataKuliah}`}>
                                Setelah {gap.sebelumKelas?.mataKuliah}
                              </span>
                            )}
                          </div>
                          <div className="truncate">
                            {gap.setelahKelas?.rawItem && onSelectItem ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectItem(gap.setelahKelas!.rawItem!);
                                }}
                                className="group/btn inline-flex items-center gap-1 text-left hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline cursor-pointer transition-colors max-w-full"
                                title={`Buka detail kelas: ${gap.setelahKelas.mataKuliah} (${gap.setelahKelas.dosen})`}
                              >
                                <span className="truncate">
                                  Sebelum <strong className="font-medium text-foreground/90 group-hover/btn:text-emerald-600 dark:group-hover/btn:text-emerald-400">{gap.setelahKelas.mataKuliah}</strong>
                                </span>
                                <ExternalLink className="size-2.5 shrink-0 opacity-60 group-hover/btn:opacity-100" />
                              </button>
                            ) : (
                              <span className="text-foreground/80" title={`Sebelum ${gap.setelahKelas?.mataKuliah}`}>
                                Sebelum {gap.setelahKelas?.mataKuliah}
                              </span>
                            )}
                          </div>
                        </>
                      ) : gap.tipeJeda === "sebelum_kelas" ? (
                        <>
                          <div className="truncate">Awal hari</div>
                          <div className="truncate">
                            {gap.setelahKelas?.rawItem && onSelectItem ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectItem(gap.setelahKelas!.rawItem!);
                                }}
                                className="group/btn inline-flex items-center gap-1 text-left hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline cursor-pointer transition-colors max-w-full"
                                title={`Buka detail kelas: ${gap.setelahKelas.mataKuliah} (${gap.setelahKelas.dosen})`}
                              >
                                <span className="truncate">
                                  Sebelum <strong className="font-medium text-foreground/90 group-hover/btn:text-emerald-600 dark:group-hover/btn:text-emerald-400">{gap.setelahKelas.mataKuliah}</strong>
                                </span>
                                <ExternalLink className="size-2.5 shrink-0 opacity-60 group-hover/btn:opacity-100" />
                              </button>
                            ) : (
                              <span className="text-foreground/80" title={`Sebelum ${gap.setelahKelas?.mataKuliah}`}>
                                Sebelum {gap.setelahKelas?.mataKuliah}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="truncate">
                            {gap.sebelumKelas?.rawItem && onSelectItem ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectItem(gap.sebelumKelas!.rawItem!);
                                }}
                                className="group/btn inline-flex items-center gap-1 text-left hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline cursor-pointer transition-colors max-w-full"
                                title={`Buka detail kelas: ${gap.sebelumKelas.mataKuliah} (${gap.sebelumKelas.dosen})`}
                              >
                                <span className="truncate">
                                  Setelah <strong className="font-medium text-foreground/90 group-hover/btn:text-emerald-600 dark:group-hover:text-emerald-400">{gap.sebelumKelas.mataKuliah}</strong>
                                </span>
                                <ExternalLink className="size-2.5 shrink-0 opacity-60 group-hover/btn:opacity-100" />
                              </button>
                            ) : (
                              <span title={`Setelah ${gap.sebelumKelas?.mataKuliah}`}>
                                Setelah {gap.sebelumKelas?.mataKuliah}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-foreground/80">
                            Hingga lab tutup ({gap.waktuSelesai} WIB)
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Clear & Legible Info Row: Status & Ruangan/Kampus (Sinkron persis dengan ScheduleGrid) */}
                  <div className="space-y-2 pt-2 border-t border-border text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      <span>Status: Ruangan Tersedia / Kosong</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <User className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="truncate">{getLabCaretaker(gap.ruangan)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                        <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{gap.kampus}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
