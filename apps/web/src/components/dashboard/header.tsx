"use client";

import * as React from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, Lock, LogOut, Moon, RefreshCw, Sun } from "lucide-react";

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState<boolean>(false);
  const [currentTime, setCurrentTime] = React.useState<string>("");
  const [isAslab, setIsAslab] = React.useState<boolean>(false);

  React.useEffect(() => {
    setMounted(true);

    // Cek status login Aslab
    setIsAslab(localStorage.getItem("aslab_logged_in") === "true");

    // Jam WIB
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setCurrentTime(`${formatted} WIB`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isDark = mounted ? (resolvedTheme || theme) === "dark" : false;

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };


  const handleLogout = () => {
    localStorage.removeItem("aslab_token");
    localStorage.removeItem("aslab_logged_in");
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur-md supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="relative flex size-10 shrink-0 items-center justify-center">
            <Image
              src="/unama.png"
              alt="Logo UNAMA"
              width={40}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                Jadwal Kuliah UNAMA
              </h1>
              <Badge variant="outline" className="hidden sm:inline-flex text-[11px] font-normal">
                Genap 2025/2026
              </Badge>
              {isAslab && (
                <Badge variant="default" className="text-[10px] font-normal bg-emerald-600 text-white">
                  Mode Aslab
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Status Indicators & Action Tools */}
        <div className="flex items-center gap-2 sm:gap-3">
          {currentTime && (
            <div className="hidden md:flex items-center gap-1.5 border border-border px-2.5 py-1 text-xs text-muted-foreground">
              <Clock className="size-3.5 text-muted-foreground" />
              <span className="font-mono">{currentTime}</span>
            </div>
          )}

          <div className="hidden lg:flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" />
            <span>Tahun Akademik 2025/2026</span>
          </div>

          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-9 px-3 gap-1.5"
              aria-label="Muat ulang data jadwal"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Perbarui</span>
            </Button>
          )}

          {isAslab ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="h-9 px-2.5 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer"
              aria-label="Keluar dari sesi Aslab"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Keluar Aslab</span>
            </Button>
          ) : (
            <a href="/login">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2.5 gap-1.5 cursor-pointer"
                aria-label="Masuk sebagai Asisten Lab"
              >
                <Lock className="size-3.5" />
                <span className="hidden sm:inline">Login Aslab</span>
              </Button>
            </a>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
            aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
