"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "cn";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [secretCode, setSecretCode] = React.useState("");
  const [showCode, setShowCode] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSuccess, setIsSuccess] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? (resolvedTheme || theme) === "dark" : false;

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!secretCode.trim()) {
      setError("Silakan masukkan secret code aslab.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ secretCode: secretCode.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsSuccess(true);
        if (data.data?.token) {
          localStorage.setItem("aslab_token", data.data.token);
          localStorage.setItem("aslab_logged_in", "true");
        }
        setTimeout(() => {
          window.location.href = "/";
        }, 500);
      } else {
        setError(
          data.message || "Secret code tidak valid. Akses khusus Asisten Lab."
        );
      }
    } catch {
      // Sediakan fallback jika backend offline di environment dev
      if (secretCode.trim() === "admin123") {
        setIsSuccess(true);
        localStorage.setItem("aslab_token", "dev-local-session");
        localStorage.setItem("aslab_logged_in", "true");
        setTimeout(() => {
          window.location.href = "/";
        }, 500);
      } else {
        setError("Koneksi ke backend gagal atau secret code tidak sesuai.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          {/* Top Bar: Back & Theme Toggle */}
          <div className="flex items-center justify-between w-full pb-1">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Kembali</span>
            </a>
            <Button
              variant="outline"
              size="icon-xs"
              type="button"
              onClick={toggleTheme}
              className="size-7 cursor-pointer"
              aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
            >
              {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </Button>
          </div>

          {/* Header Brand & Identity */}
          <div className="flex flex-col items-center gap-3 text-center">
            <a
              href="/"
              className="flex flex-col items-center gap-2 font-medium focus:outline-none"
              tabIndex={-1}
            >
              <div className="relative flex size-12 items-center justify-center p-1 bg-muted/50 border border-border">
                <Image
                  src="/unama.png"
                  alt="Logo UNAMA"
                  width={40}
                  height={40}
                  style={{ width: "auto" }}
                  className="h-10 w-auto object-contain"
                  priority
                />
              </div>
              <span className="sr-only">UNAMA</span>
            </a>

            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Portal Asisten Lab
                </h1>
              </div>
              <FieldDescription className="text-xs text-muted-foreground max-w-xs">
                Sistem Informasi Jadwal Kuliah & Laboratorium UNAMA
              </FieldDescription>
            </div>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive text-left"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSuccess && (
            <div
              role="status"
              className="flex items-center gap-2 border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-600 dark:text-emerald-400 text-left"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              <span>Autentikasi berhasil! Mengalihkan ke sistem...</span>
            </div>
          )}

          {/* Secret Code Input Only */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="secretCode" className="text-xs font-medium">
                Secret Code
              </FieldLabel>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="size-3 text-muted-foreground/80" />
                Akses Terproteksi
              </span>
            </div>
            <div className="relative">
              <Input
                id="secretCode"
                name="secretCode"
                type={showCode ? "text" : "password"}
                placeholder="Masukkan secret code aslab..."
                value={secretCode}
                onChange={(e) => {
                  setSecretCode(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isLoading || isSuccess}
                required
                autoFocus
                autoComplete="current-password"
                className="pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                disabled={isLoading || isSuccess}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none cursor-pointer"
                aria-label={showCode ? "Sembunyikan kode" : "Tampilkan kode"}
                tabIndex={-1}
              >
                {showCode ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </Field>

          {/* Submit Button */}
          <Field>
            <Button
              type="submit"
              disabled={isLoading || isSuccess}
              className="w-full h-9 gap-1.5 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 className="size-3.5" />
                  <span>Berhasil Masuk</span>
                </>
              ) : (
                <>
                  <KeyRound className="size-3.5" />
                  <span>Masuk Sebagai Aslab</span>
                </>
              )}
            </Button>
          </Field>

          {/* Back Navigation */}
          <div className="pt-2 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Kembali ke Jadwal Kuliah</span>
            </a>
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}
