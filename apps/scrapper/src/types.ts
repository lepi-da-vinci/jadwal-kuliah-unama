export interface ScrapedScheduleItem {
  no: number;
  hari: string;
  tanggal: string;
  waktuMulai: string;
  dosen: string;
  kodeKelas: string;
  mataKuliah: string;
  kampus: string;
  ruangLabor: string;
  status: string;
}

export interface ScrapePageResult {
  page: number;
  totalPages: number;
  totalClasses: number;
  items: ScrapedScheduleItem[];
}
