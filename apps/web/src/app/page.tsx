"use client";

import * as React from "react";
import { Header } from "@/components/dashboard/header";
import { StatsOverview } from "@/components/dashboard/stats-overview";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ScheduleGrid } from "@/components/dashboard/schedule-grid";
import { ScheduleTable } from "@/components/dashboard/schedule-table";
import { ScheduleDetailDialog } from "@/components/dashboard/schedule-detail-dialog";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJadwalList, fetchJadwalSummary } from "@/lib/api";
import {
  JadwalFilters,
  JadwalItem,
  JadwalSummaryData,
  JadwalSummaryFilters,
  PaginationMeta,
  formatDateDb,
} from "@/lib/types";

export default function HomePage() {
  const [summary, setSummary] = React.useState<JadwalSummaryData>({
    totalJadwal: 0,
    kampusList: [],
    ruanganList: [],
  });
  const [isSummaryLoading, setIsSummaryLoading] = React.useState<boolean>(true);

  // Tanggal terpilih (Default hari ini)
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(() => new Date());

  const [items, setItems] = React.useState<JadwalItem[]>([]);
  const [pagination, setPagination] = React.useState<PaginationMeta>({
    total: 0,
    limit: 24,
    offset: 0,
    hasMore: false,
  });
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const [filters, setFilters] = React.useState<JadwalFilters>(() => ({
    search: "",
    hari: "Semua",
    tanggal: formatDateDb(new Date()),
    kampus: "Semua",
    ruangan: "Semua",
    status: "Semua",
    page: 1,
    limit: 24,
  }));

  const [viewMode, setViewMode] = React.useState<"grid" | "table">("grid");
  const [selectedItem, setSelectedItem] = React.useState<JadwalItem | null>(null);

  // Muat ringkasan data saat filter berubah (tanggal, kampus, ruangan, pencarian)
  // Catatan: filter status sengaja dikecualikan agar breakdown di StatsOverview tetap akurat
  const loadSummaryData = React.useCallback(async (summaryFilters?: JadwalSummaryFilters) => {
    setIsSummaryLoading(true);
    try {
      const res = await fetchJadwalSummary(summaryFilters);
      if (res.success && res.data) {
        setSummary((prev) => ({
          ...res.data,
          kampusList: res.data.kampusList?.length ? res.data.kampusList : prev.kampusList,
          ruanganList: res.data.ruanganList?.length ? res.data.ruanganList : prev.ruanganList,
        }));
      }
    } catch {
      // Handled in api client
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  // Muat data jadwal berdasarkan filter aktif
  const loadJadwalData = React.useCallback(async (activeFilters: JadwalFilters) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchJadwalList(activeFilters);
      if (res.success) {
        setItems(res.data);
        setPagination(res.pagination);
      } else {
        setError("Gagal memuat jadwal kuliah. Silakan coba kembali.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi kendala saat memuat data";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSummaryData({
      tanggal: filters.tanggal,
      kampus: filters.kampus,
      ruangan: filters.ruangan,
      search: filters.search,
    });
  }, [filters.tanggal, filters.kampus, filters.ruangan, filters.search, loadSummaryData]);

  React.useEffect(() => {
    loadJadwalData(filters);
  }, [filters, loadJadwalData]);

  const handleFilterChange = React.useCallback((newFilters: Partial<JadwalFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      // Reset ke halaman 1 setiap ada perubahan kriteria pencarian/filter
      page: newFilters.page !== undefined ? newFilters.page : 1,
    }));
  }, []);

  const handleDateChange = React.useCallback((date: Date | null) => {
    setSelectedDate(date);
    setFilters((prev) => ({
      ...prev,
      tanggal: date ? formatDateDb(date) : undefined,
      page: 1,
    }));
  }, []);

  const handleResetFilters = React.useCallback(() => {
    setSelectedDate(null);
    setFilters({
      search: "",
      hari: "Semua",
      tanggal: undefined,
      kampus: "Semua",
      ruangan: "Semua",
      status: "Semua",
      page: 1,
      limit: 24,
    });
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      loadSummaryData({
        tanggal: filters.tanggal,
        kampus: filters.kampus,
        ruangan: filters.ruangan,
        search: filters.search,
      }),
      loadJadwalData(filters),
    ]);
    setIsRefreshing(false);
  };

  const totalPages = Math.max(1, Math.ceil(pagination.total / (filters.limit || 24)));

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 dark:bg-background text-foreground">
      {/* Header Bar */}
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Intro Banner */}
        <section className="space-y-1">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Jadwal Perkuliahan 
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Informasi jadwal penggunaan kelas mahasiswa Universitas Dinamika Bangsa (UNAMA).
              </p>
            </div>
          </div>
        </section>

        {/* Real Statistics Overview (Menyesuaikan dengan Filter Kampus, Ruangan, Tanggal, & Pencarian) */}
        <section aria-label="Ringkasan Statistik Jadwal">
          <StatsOverview
            totalJadwal={summary.totalJadwal}
            totalCancel={summary.totalCancel}
            totalOnline={summary.totalOnline}
            totalTatapMuka={summary.totalTatapMuka}
            totalKampus={summary.kampusList.length || 2}
            totalRuangan={summary.ruanganList.length || 11}
            selectedDate={selectedDate}
            selectedKampus={filters.kampus}
            selectedRuangan={filters.ruangan}
            isLoading={isSummaryLoading}
          />
        </section>

        {/* Multi-Criteria Filter Bar (Dengan Kalender Tanggal dan Tombol Kiri/Kanan) */}
        <section aria-label="Panel Pencarian dan Penyaringan">
          <FilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            kampusList={summary.kampusList}
            ruanganList={summary.ruanganList}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            totalFiltered={pagination.total}
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
          />
        </section>

        {/* Error Alert State (Antislop R-27 Compliant) */}
        {error && (
          <section aria-label="Pemberitahuan Kesalahan" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-5 shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="h-8 gap-1 text-xs border-destructive/40 hover:bg-destructive/20"
              >
                <RefreshCw className="size-3.5" />
                <span>Coba Lagi</span>
              </Button>
            </div>
          </section>
        )}

        {/* Schedule Display (Dual View: Grid or Table) */}
        <section aria-label="Daftar Jadwal Kelas" className="space-y-4">
          {viewMode === "grid" ? (
            <ScheduleGrid
              items={items}
              isLoading={isLoading}
              onSelectItem={setSelectedItem}
              onResetFilters={handleResetFilters}
              selectedDate={selectedDate}
            />
          ) : (
            <ScheduleTable
              items={items}
              isLoading={isLoading}
              onSelectItem={setSelectedItem}
              onResetFilters={handleResetFilters}
              selectedDate={selectedDate}
            />
          )}

          {/* Pagination Controls */}
          {!isLoading && pagination.total > 0 && (
            <PaginationControls
              currentPage={filters.page || 1}
              totalPages={totalPages}
              totalItems={pagination.total}
              limit={filters.limit || 24}
              onPageChange={(page) => handleFilterChange({ page })}
              onLimitChange={(limit) => handleFilterChange({ limit, page: 1 })}
            />
          )}
        </section>
      </main>

      {/* Modal Detail Dialog */}
      <ScheduleDetailDialog item={selectedItem} onClose={() => setSelectedItem(null)} />

      {/* Public Footer */}
      <footer className="mt-auto border-t border-border/80 bg-muted/20 py-6 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div>
            <p className="font-medium text-foreground">Universitas Dinamika Bangsa (UNAMA)</p>
            <p className="text-[11px] mt-0.5">Portal Publik Jadwal Kuliah & Laboratorium Komputer</p>
          </div>
          <div className="text-[11px] text-center sm:text-right">
            <p>Data diperbarui secara berkala dari Sistem Informasi Akademik.</p>
            <p className="text-muted-foreground/80 mt-0.5">Semua data waktu ditampilkan dalam Waktu Indonesia Barat (WIB).</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
