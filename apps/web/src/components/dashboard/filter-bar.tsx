"use client";

import * as React from "react";
import { format, addDays, subDays } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  RotateCcw,
  Search,
  Table as TableIcon,
  X,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { JadwalFilters, formatDateDb } from "@/lib/types";
import { useDebounce } from "@/hooks/use-debounce";

interface FilterBarProps {
  filters: JadwalFilters;
  onFilterChange: (newFilters: Partial<JadwalFilters>) => void;
  onResetFilters: () => void;
  kampusList: string[];
  ruanganList: string[];
  viewMode: "grid" | "table";
  onViewModeChange: (mode: "grid" | "table") => void;
  totalFiltered: number;
  selectedDate: Date | null;
  onDateChange: (date: Date | null) => void;
}

const STATUS_OPTIONS = [
  { value: "Semua", label: "Semua Status" },
  { value: "OnSchedule (TM)", label: "Tatap Muka" },
  { value: "OnSchedule (OL)", label: "Online" },
  { value: "Cancel", label: "Cancel" },
];

export function FilterBar({
  filters,
  onFilterChange,
  onResetFilters,
  kampusList,
  ruanganList,
  viewMode,
  onViewModeChange,
  totalFiltered,
  selectedDate,
  onDateChange,
}: FilterBarProps) {
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);

  // Search state dengan pelindung ref user typing agar tidak terjadi race condition saat filter direset
  const [searchValue, setSearchValue] = React.useState(filters.search || "");
  const debouncedSearch = useDebounce(searchValue, 400);
  const isUserTypingRef = React.useRef(false);

  // Sync hanya jika filters.search direset/diubah dari luar (misal: tombol reset)
  React.useEffect(() => {
    const externalSearch = filters.search || "";
    if (externalSearch !== searchValue) {
      isUserTypingRef.current = false;
      setSearchValue(externalSearch);
    }
  }, [filters.search]);

  // Eksekusi filter search HANYA jika dipicu oleh ketikan user (debounced 400ms)
  React.useEffect(() => {
    if (isUserTypingRef.current) {
      isUserTypingRef.current = false;
      onFilterChange({ search: debouncedSearch, page: 1 });
    }
  }, [debouncedSearch, onFilterChange]);

  const isFiltered = Boolean(
    (filters.search && filters.search.trim().length > 0) ||
      filters.tanggal ||
      (filters.kampus && filters.kampus !== "Semua") ||
      (filters.ruangan && filters.ruangan !== "Semua") ||
      (filters.status && filters.status !== "Semua")
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isUserTypingRef.current = true;
    setSearchValue(e.target.value);
  };

  const handleClearSearch = () => {
    isUserTypingRef.current = false;
    setSearchValue("");
    onFilterChange({ search: "", page: 1 });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      isUserTypingRef.current = false;
      onFilterChange({ search: searchValue, page: 1 });
    }
  };

  const handlePrevDay = () => {
    const cur = selectedDate || new Date();
    const newDate = subDays(cur, 1);
    onDateChange(newDate);
    onFilterChange({ tanggal: formatDateDb(newDate), page: 1 });
  };

  const handleNextDay = () => {
    const cur = selectedDate || new Date();
    const newDate = addDays(cur, 1);
    onDateChange(newDate);
    onFilterChange({ tanggal: formatDateDb(newDate), page: 1 });
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      onDateChange(date);
      onFilterChange({ tanggal: formatDateDb(date), page: 1 });
      setIsCalendarOpen(false);
    }
  };

  const handleClearDate = () => {
    onDateChange(null);
    onFilterChange({ tanggal: undefined, page: 1 });
  };

  return (
    <div className="space-y-3 border border-border bg-card p-3 sm:p-4 shadow-xs">
      {/* Search Bar (Full width with responsive placeholder) */}
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Cari matkul, dosen, atau kode..."
          value={searchValue}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          className="h-9 sm:h-10 pl-9 pr-9 text-xs sm:text-sm"
        />
        {searchValue && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
            aria-label="Hapus teks pencarian"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Date Selector (Left) & View Mode Switcher (Right) */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-0.5">
        {/* Date Selector with Left/Right Buttons */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground mr-0.5 shrink-0">Tanggal:</span>

          {/* Tombol Kiri */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handlePrevDay}
            className="size-7 rounded-none shrink-0"
            title="Hari Sebelumnya"
            aria-label="Hari Sebelumnya"
          >
            <ChevronLeft className="size-3.5" />
          </Button>

          {/* Tombol Kalender Popover */}
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger className="inline-flex items-center gap-1.5 h-7 px-2 sm:px-2.5 border border-border bg-background text-foreground text-xs font-medium hover:bg-muted/40 transition-colors cursor-pointer select-none rounded-none shadow-2xs max-w-[150px] sm:max-w-none">
              <CalendarIcon className="size-3.5 text-primary shrink-0" />
              <span className="truncate hidden sm:inline">
                {selectedDate
                  ? format(selectedDate, "EEEE, dd MMMM yyyy", { locale: localeId })
                  : "Semua Tanggal"}
              </span>
              <span className="truncate sm:hidden">
                {selectedDate
                  ? format(selectedDate, "dd MMM yyyy", { locale: localeId })
                  : "Semua Tanggal"}
              </span>
            </PopoverTrigger>

            <PopoverContent
              align="start"
              className="w-auto p-2 rounded-none bg-card border-border shadow-xl space-y-1.5"
            >
              <Calendar
                mode="single"
                selected={selectedDate || undefined}
                defaultMonth={selectedDate || new Date(2026, 3, 13)}
                onSelect={handleDateSelect}
                locale={localeId}
                className="rounded-none border border-border bg-background p-1"
              />
              <div className="flex items-center justify-between border-t border-border pt-1.5 px-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] font-medium rounded-none cursor-pointer"
                  onClick={() => handleDateSelect(new Date())}
                >
                  Hari Ini
                </Button>
                {selectedDate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground rounded-none cursor-pointer"
                    onClick={() => {
                      handleClearDate();
                      setIsCalendarOpen(false);
                    }}
                  >
                    Semua Tanggal
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Tombol Kanan */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleNextDay}
            className="size-7 rounded-none shrink-0"
            title="Hari Berikutnya"
            aria-label="Hari Berikutnya"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        {/* View Toggle (Kartu / Tabel) */}
        <div className="inline-flex border border-border p-0.5 bg-muted/40 shrink-0">
          <Button
            type="button"
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange("grid")}
            className="h-7 px-2 sm:px-2.5 gap-1.5 text-xs rounded-none"
            aria-label="Tampilan Kartu Grid"
            title="Tampilan Kartu Grid"
          >
            <LayoutGrid className="size-3.5" />
            <span className="hidden sm:inline">Kartu</span>
          </Button>
          <Button
            type="button"
            variant={viewMode === "table" ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange("table")}
            className="h-7 px-2 sm:px-2.5 gap-1.5 text-xs rounded-none"
            aria-label="Tampilan Tabel"
            title="Tampilan Tabel"
          >
            <TableIcon className="size-3.5" />
            <span className="hidden sm:inline">Tabel</span>
          </Button>
        </div>
      </div>

      {/* Dropdown Filters (Kampus, Ruangan, Status) */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-1 border-t border-border/50">
        <div>
          <label htmlFor="filter-kampus" className="block text-[11px] font-medium text-muted-foreground mb-1">
            Kampus
          </label>
          <NativeSelect
            id="filter-kampus"
            value={filters.kampus || "Semua"}
            onChange={(e) => onFilterChange({ kampus: e.target.value, page: 1 })}
            className="w-full"
          >
            <NativeSelectOption value="Semua">Semua Kampus</NativeSelectOption>
            {kampusList.map((k) => (
              <NativeSelectOption key={k} value={k}>
                {k}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div>
          <label htmlFor="filter-ruangan" className="block text-[11px] font-medium text-muted-foreground mb-1">
            Ruangan
          </label>
          <NativeSelect
            id="filter-ruangan"
            value={filters.ruangan || "Semua"}
            onChange={(e) => onFilterChange({ ruangan: e.target.value, page: 1 })}
            className="w-full"
          >
            <NativeSelectOption value="Semua">Semua Ruangan</NativeSelectOption>
            {ruanganList.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {r}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div>
          <label htmlFor="filter-status" className="block text-[11px] font-medium text-muted-foreground mb-1">
            Status Jadwal
          </label>
          <NativeSelect
            id="filter-status"
            value={filters.status || "Semua"}
            onChange={(e) => onFilterChange({ status: e.target.value, page: 1 })}
            className="w-full"
          >
            {STATUS_OPTIONS.map((s) => (
              <NativeSelectOption key={s.value} value={s.value}>
                {s.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      {/* Active Filter Info & Reset Action */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-muted-foreground border-t border-border/40">
        <div>
          <span>Menampilkan </span>
          <span className="font-semibold text-foreground">{totalFiltered.toLocaleString("id-ID")}</span>
          <span> sesi jadwal kelas</span>
        </div>

        {isFiltered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RotateCcw className="size-3" />
            <span>Atur Ulang Filter</span>
          </Button>
        )}
      </div>
    </div>
  );
}
