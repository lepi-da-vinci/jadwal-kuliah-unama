import { JadwalItem } from "./types";

export interface LabGapClassRef {
  mataKuliah: string;
  dosen: string;
  rawItem?: JadwalItem;
}

export interface LabGapInfo {
  id: string;
  ruangan: string;
  kampus: string;
  isLabor: boolean;
  totalMenit: number;
  totalJamText: string;
  waktuMulai: string;
  waktuSelesai: string;
  tipeJeda: "sebelum_kelas" | "antar_kelas" | "setelah_kelas" | "seharian_kosong";
  sebelumKelas?: LabGapClassRef;
  setelahKelas?: LabGapClassRef;
  formattedText: string;
}

export interface InUseRoomInfo {
  id: number;
  ruangan: string;
  kampus: string;
  isLabor: boolean;
  mataKuliah: string;
  dosen: string;
  kodeKelas: string;
  waktuMulai: string;
  waktuSelesai: string;
  status: string;
  isLiveNow: boolean;
  progressPercent: number;
  rawItem?: JadwalItem;
}

export const UNAMA_LABS = [
  "Labor 1.1",
  "Labor 1.2",
  "Labor 1.3",
  "Labor 1.4",
  "Labor 1.5",
  "Labor 1.6",
  "Labor 1.7",
  "Labor 1.8",
  "Labor 1.9",
  "Labor 2.1",
  "Labor 2.2",
  "Labor 2.3",
  "Labor 3.1",
  "Labor 3.2",
];

/**
 * Data petugas jaga aslab laboratorium
 */
export const ASLAB_CARETAKERS: Record<string, string> = {
  "Labor 1.9": "Raffi",
  "Labor 1.8": "Haikal",
};

/**
 * Dapatkan nama petugas jaga laboratorium berdasarkan nama ruangan
 */
export function getLabCaretaker(room: string): string {
  if (!room) return "Penjaga Labor";
  const normalized = room.trim();

  for (const [key, name] of Object.entries(ASLAB_CARETAKERS)) {
    if (key.toLowerCase() === normalized.toLowerCase()) {
      return name;
    }
  }

  if (normalized.toLowerCase().startsWith("labor")) {
    return `Penjaga ${normalized}`;
  }
  return `Penjaga Labor ${normalized}`;
}

/**
 * Cek apakah sebuah nama ruangan merupakan Laboratorium
 */
export function isLabRoom(roomName: string): boolean {
  if (!roomName) return false;
  const lower = roomName.toLowerCase();
  return (
    lower.includes("labor") ||
    lower.includes("lab ") ||
    lower.startsWith("lab") ||
    UNAMA_LABS.some((l) => l.toLowerCase() === lower)
  );
}

/**
 * Konversi waktu "HH:mm" ke total menit dari jam 00:00
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(":");
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Konversi total menit ke format "HH:mm"
 */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Format total menit menjadi representasi durasi yang ringkas dan alami (e.g. "30 Menit", "1 Jam", "1 Jam 30 Menit")
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m} Menit`;
  }
  if (m === 0) {
    return `${h} Jam`;
  }
  return `${h} Jam ${m} Menit`;
}

/**
 * Normalisasi nama kampus
 */
export function normalizeCampus(campus?: string): string {
  if (!campus) return "Kampus Thehok";
  const lower = campus.toLowerCase();
  if (lower.includes("kobar")) return "Kampus Kobar";
  if (lower.includes("thehok")) return "Kampus Thehok";
  return campus;
}

/**
 * Ambil kampus dari ruangan berdasarkan data jadwal atau pola nama ruangan
 */
export function getCampusForRoom(room: string, items?: JadwalItem[]): string {
  if (items && items.length > 0) {
    const itemWithCampus = items.find(
      (i) => i.ruangan?.trim().toLowerCase() === room.trim().toLowerCase() && i.kampus
    );
    if (itemWithCampus?.kampus) {
      return normalizeCampus(itemWithCampus.kampus);
    }
  }

  const lower = room.toLowerCase();
  if (
    lower.includes("kobar") ||
    lower.includes("1.3") ||
    lower.includes("1.5") ||
    lower.includes("1.6") ||
    lower.includes("1.7") ||
    lower.includes("1.8") ||
    lower.includes("1.9") ||
    lower.includes("2.3") ||
    lower.includes("3.1")
  ) {
    return "Kampus Kobar";
  }
  return "Kampus Thehok";
}

/**
 * Hitung waktu tutup operasional lab per kampus:
 * - Kampus Kobar: Pulang pukul 17:00 WIB
 * - Kampus Thehok: Sampai sesi praktikum lab terakhir selesai pada hari tersebut ("sampe selesai pokoknya")
 */
export function getCampusLabCloseTimes(items: JadwalItem[]): Record<string, number> {
  const KOBAR_CLOSING = timeToMinutes("17:00"); // 17:00 WIB (1020 menit) - Aslab Kobar pulang jam 17:00
  const closeTimes: Record<string, number> = {
    "Kampus Kobar": KOBAR_CLOSING,
  };

  let maxThehokEnd = 0;

  for (const item of items) {
    if (
      !item.status?.toLowerCase().includes("cancel") &&
      !item.status?.toLowerCase().includes("batal") &&
      isLabRoom(item.ruangan)
    ) {
      const campus = getCampusForRoom(item.ruangan, items);
      const startMins = timeToMinutes(item.waktuMulai);
      const endMins = startMins + 100; // Durasi standar 100 menit perkuliahan

      if (campus === "Kampus Thehok") {
        if (endMins > maxThehokEnd) {
          maxThehokEnd = endMins;
        }
      }
    }
  }

  // Di Thehok, operasional berjalan sampai sesi lab terakhir selesai
  closeTimes["Kampus Thehok"] = maxThehokEnd > 0 ? maxThehokEnd : timeToMinutes("21:00");

  return closeTimes;
}

/**
 * Estimasi waktu selesai perkuliahan UNAMA (Standar ~100 menit per sesi)
 */
export function estimateEndTime(waktuMulai: string, nextClassStart?: string): string {
  const startMins = timeToMinutes(waktuMulai);
  const defaultDuration = 100; // 100 menit standar perkuliahan 2 SKS

  if (nextClassStart) {
    const nextMins = timeToMinutes(nextClassStart);
    if (nextMins > startMins && nextMins - startMins <= defaultDuration) {
      return nextClassStart;
    }
  }

  return minutesToTime(Math.min(startMins + defaultDuration, 21 * 60 + 30));
}

/**
 * Ambil daftar ruangan yang sedang dipakai berdasarkan data jadwal
 * @param items Daftar jadwal kelas untuk tanggal tertentu
 * @param nowTime Optional waktu spesifik "HH:mm". Jika tidak diisi, menggunakan jam sistem saat ini (WIB)
 */
export function getInUseRooms(
  items: JadwalItem[],
  nowTime?: string
): {
  activeNow: InUseRoomInfo[];
  allTodayUsed: InUseRoomInfo[];
} {
  let currentMinutes: number;

  if (nowTime) {
    currentMinutes = timeToMinutes(nowTime);
  } else {
    // Jam WIB sekarang
    const now = new Date();
    const wibHours = (now.getUTCHours() + 7) % 24;
    const wibMins = now.getUTCMinutes();
    currentMinutes = wibHours * 60 + wibMins;
  }

  // Saring jadwal yang tidak dibatalkan
  const validItems = items.filter(
    (item) => !item.status?.toLowerCase().includes("cancel") && !item.status?.toLowerCase().includes("batal")
  );

  const allTodayUsed: InUseRoomInfo[] = [];
  const activeNow: InUseRoomInfo[] = [];

  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    const startMins = timeToMinutes(item.waktuMulai);
    const endMins = startMins + 100; // 100 menit
    const waktuSelesai = minutesToTime(endMins);

    const isLive = currentMinutes >= startMins && currentMinutes < endMins;
    const elapsed = Math.max(0, currentMinutes - startMins);
    const progress = Math.min(100, Math.max(0, Math.round((elapsed / 100) * 100)));

    const inUseInfo: InUseRoomInfo = {
      id: item.id,
      ruangan: item.ruangan,
      kampus: item.kampus || "Kampus Thehok",
      isLabor: isLabRoom(item.ruangan),
      mataKuliah: item.mataKuliah,
      dosen: item.dosen,
      kodeKelas: item.kodeKelas,
      waktuMulai: item.waktuMulai,
      waktuSelesai,
      status: item.status,
      isLiveNow: isLive,
      progressPercent: progress,
      rawItem: item,
    };

    allTodayUsed.push(inUseInfo);

    if (isLive) {
      activeNow.push(inUseInfo);
    }
  }

  return { activeNow, allTodayUsed };
}

/**
 * Menghitung seluruh jeda waktu kosong per ruang labor sepanjang hari operasional
 * (mulai 07:30 WIB hingga sesi praktikum lab terakhir di kampus tersebut tutup)
 */
export function calculateLabGaps(
  items: JadwalItem[],
  allKnownRooms: string[] = UNAMA_LABS,
  filterKampus?: string
): LabGapInfo[] {
  const CAMPUS_START = timeToMinutes("07:30"); // 450 menit (07:30 WIB)
  const MIN_GAP_MINUTES = 30; // Jeda minimal 30 menit untuk dihitung kosong

  // Hitung jam lab terakhir selesai per kampus hari ini
  const campusCloseTimes = getCampusLabCloseTimes(items);

  // Gabungkan semua ruangan laboratorium yang diketahui
  const allRooms = Array.from(new Set([...UNAMA_LABS, ...allKnownRooms])).filter((r) => isLabRoom(r));

  const gaps: LabGapInfo[] = [];

  for (const room of allRooms) {
    // Tentukan kampus ruangan ini
    const campus = getCampusForRoom(room, items);

    if (filterKampus && filterKampus !== "Semua" && campus !== filterKampus) {
      continue;
    }

    // Jam lab terakhir tutup untuk kampus ini hari ini
    const campusClose = campusCloseTimes[campus];

    // Jika di kampus ini tidak ada perkuliahan lab sama sekali hari ini, aslab tidak berdinas / lab tutup
    if (!campusClose || campusClose <= CAMPUS_START) {
      continue;
    }

    // Ambil jadwal di ruangan ini yang tidak batal
    const roomClasses = items
      .filter(
        (item) =>
          item.ruangan?.trim().toLowerCase() === room.trim().toLowerCase() &&
          !item.status?.toLowerCase().includes("cancel") &&
          !item.status?.toLowerCase().includes("batal")
      )
      .sort((a, b) => timeToMinutes(a.waktuMulai) - timeToMinutes(b.waktuMulai));

    const isLabor = isLabRoom(room);

    // Kasus 1: Ruangan tidak ada jadwal sama sekali sepanjang hari, tapi lab kampus buka s/d campusClose
    if (roomClasses.length === 0) {
      if (campusClose - CAMPUS_START >= MIN_GAP_MINUTES) {
        const durationMins = campusClose - CAMPUS_START;
        const totalJam = formatDuration(durationMins);
        const endTimeStr = minutesToTime(campusClose);
        const text = `${room} kosong 07:30 - ${endTimeStr} (${totalJam})`;

        gaps.push({
          id: `gap-${room}-full`,
          ruangan: room,
          kampus: campus,
          isLabor,
          totalMenit: durationMins,
          totalJamText: totalJam,
          waktuMulai: "07:30",
          waktuSelesai: endTimeStr,
          tipeJeda: "seharian_kosong",
          formattedText: text,
        });
      }
      continue;
    }

    // Kasus 2: Jeda di awal hari sebelum kelas pertama
    const firstClass = roomClasses[0];
    const firstClassStart = timeToMinutes(firstClass.waktuMulai);
    const effectiveFirstStart = Math.min(firstClassStart, campusClose);

    if (effectiveFirstStart - CAMPUS_START >= MIN_GAP_MINUTES) {
      const durationMins = effectiveFirstStart - CAMPUS_START;
      const totalJam = formatDuration(durationMins);
      const waktuSelesai = minutesToTime(effectiveFirstStart);
      const text = `${room} kosong 07:30 - ${waktuSelesai} (${totalJam})`;

      gaps.push({
        id: `gap-${room}-start`,
        ruangan: room,
        kampus: campus,
        isLabor,
        totalMenit: durationMins,
        totalJamText: totalJam,
        waktuMulai: "07:30",
        waktuSelesai,
        tipeJeda: "sebelum_kelas",
        setelahKelas: {
          mataKuliah: firstClass.mataKuliah,
          dosen: firstClass.dosen,
          rawItem: firstClass,
        },
        formattedText: text,
      });
    }

    // Kasus 3: Jeda antar kelas sepanjang hari (hanya selama jam buka lab kampus)
    for (let i = 0; i < roomClasses.length - 1; i++) {
      const currentClass = roomClasses[i];
      const nextClass = roomClasses[i + 1];

      const currentStart = timeToMinutes(currentClass.waktuMulai);
      const currentEnd = currentStart + 100; // Durasi standar 100 menit
      const nextStart = timeToMinutes(nextClass.waktuMulai);

      // Jika jeda ini dimulai saat lab kampus sudah tutup (misal setelah 17:00 di Kobar), jangan buat jeda
      if (currentEnd >= campusClose) {
        continue;
      }

      // Batasi jeda tidak melebihi jam tutup lab kampus
      const effectiveEnd = Math.min(nextStart, campusClose);

      if (effectiveEnd - currentEnd >= MIN_GAP_MINUTES) {
        const durationMins = effectiveEnd - currentEnd;
        const totalJam = formatDuration(durationMins);
        const startTimeStr = minutesToTime(currentEnd);
        const endTimeStr = minutesToTime(effectiveEnd);
        const text = `${room} kosong ${startTimeStr} - ${endTimeStr} (${totalJam})`;

        gaps.push({
          id: `gap-${room}-${i}`,
          ruangan: room,
          kampus: campus,
          isLabor,
          totalMenit: durationMins,
          totalJamText: totalJam,
          waktuMulai: startTimeStr,
          waktuSelesai: endTimeStr,
          tipeJeda: "antar_kelas",
          sebelumKelas: {
            mataKuliah: currentClass.mataKuliah,
            dosen: currentClass.dosen,
            rawItem: currentClass,
          },
          setelahKelas: {
            mataKuliah: nextClass.mataKuliah,
            dosen: nextClass.dosen,
            rawItem: nextClass,
          },
          formattedText: text,
        });
      }
    }

    // Kasus 4: Jeda di akhir hari setelah kelas terakhir, HANYA sampai lab terakhir di kampus tersebut tutup
    const lastClass = roomClasses[roomClasses.length - 1];
    const lastClassEnd = timeToMinutes(lastClass.waktuMulai) + 100;

    // Jika lab ruangan ini selesai sebelum jam tutup kampus (minimal jeda 30 menit)
    if (lastClassEnd < campusClose && campusClose - lastClassEnd >= MIN_GAP_MINUTES) {
      const durationMins = campusClose - lastClassEnd;
      const totalJam = formatDuration(durationMins);
      const startTimeStr = minutesToTime(lastClassEnd);
      const endTimeStr = minutesToTime(campusClose);
      const text = `${room} kosong ${startTimeStr} - ${endTimeStr} (${totalJam})`;

      gaps.push({
        id: `gap-${room}-end`,
        ruangan: room,
        kampus: campus,
        isLabor,
        totalMenit: durationMins,
        totalJamText: totalJam,
        waktuMulai: startTimeStr,
        waktuSelesai: endTimeStr,
        tipeJeda: "setelah_kelas",
        sebelumKelas: {
          mataKuliah: lastClass.mataKuliah,
          dosen: lastClass.dosen,
          rawItem: lastClass,
        },
        formattedText: text,
      });
    }
  }

  // Urutkan berdasarkan ruangan, lalu waktu mulai
  return gaps.sort((a, b) => {
    if (a.ruangan === b.ruangan) {
      return timeToMinutes(a.waktuMulai) - timeToMinutes(b.waktuMulai);
    }
    return a.ruangan.localeCompare(b.ruangan);
  });
}
