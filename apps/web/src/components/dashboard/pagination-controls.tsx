"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

export function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  limit,
  onPageChange,
  onLimitChange,
}: PaginationControlsProps) {
  if (totalItems === 0) return null;

  // Render max 5 page numbers around currentPage
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-3">
      {/* Items per page selector */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground order-2 sm:order-1">
        <span>Baris per halaman:</span>
        <NativeSelect
          size="sm"
          value={limit.toString()}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className="w-20"
        >
          <NativeSelectOption value="12">12</NativeSelectOption>
          <NativeSelectOption value="24">24</NativeSelectOption>
          <NativeSelectOption value="48">48</NativeSelectOption>
          <NativeSelectOption value="96">96</NativeSelectOption>
        </NativeSelect>
        <span className="hidden md:inline">
          (Total {totalItems.toLocaleString("id-ID")} jadwal)
        </span>
      </div>

      {/* Pagination Navigation */}
      <div className="flex items-center gap-1 order-1 sm:order-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="h-8 px-2.5 gap-1 text-xs"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="size-3.5" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </Button>

        <div className="flex items-center gap-1 mx-1">
          {pages.map((p, idx) => {
            if (p === "...") {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">
                  ...
                </span>
              );
            }
            const pageNum = Number(p);
            const isActive = pageNum === currentPage;
            return (
              <Button
                key={`page-${pageNum}`}
                type="button"
                variant={isActive ? "default" : "ghost"}
                size="sm"
                onClick={() => onPageChange(pageNum)}
                className="h-8 w-8 p-0 text-xs font-mono"
                aria-current={isActive ? "page" : undefined}
                aria-label={`Halaman ${pageNum}`}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="h-8 px-2.5 gap-1 text-xs"
          aria-label="Halaman berikutnya"
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
