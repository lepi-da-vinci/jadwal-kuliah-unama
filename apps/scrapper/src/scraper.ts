import * as cheerio from 'cheerio';
import type { ScrapedScheduleItem, ScrapePageResult } from './types';

const BASE_URL = 'https://baak.unama.ac.id/jadwal-kuliah';

/**
 * Scrape satu halaman jadwal perkuliahan dari BAAK UNAMA
 * @param page Nomor halaman (default: 1)
 * @param ruang Filter ruang kelas ('', 'labor', 'teori'. Default: '' untuk semua kelas)
 */
export async function scrapeLabSchedulePage(page = 1, ruang = ''): Promise<ScrapePageResult> {
  const ruangParam = ruang ? `&ruang=${encodeURIComponent(ruang)}` : '';
  const url = `${BASE_URL}?search=1${ruangParam}&page=${page}`;
  
  let res: Response | null = null;
  let lastError: any = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (res.ok) break;
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (err: any) {
      lastError = err;
      if (attempt < 3) {
        const delay = attempt * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  if (!res || !res.ok) {
    throw new Error(`Gagal mengambil data dari ${url} setelah 3 percobaan: ${lastError?.message}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Ambil total kelas dari card header: "Hasil Pencarian: 3267 Kelas"
  const headerText = $('.card-header').text();
  const totalClassesMatch = headerText.match(/Hasil Pencarian:\s*(\d+)\s*Kelas/i);
  const totalClasses = totalClassesMatch ? parseInt(totalClassesMatch[1], 10) : 0;

  // Hitung total halaman dari link pagination
  let maxPageFound = 1;
  $('ul.pagination a.page-link').each((_, el) => {
    const pageNum = parseInt($(el).text().trim(), 10);
    if (!isNaN(pageNum) && pageNum > maxPageFound) {
      maxPageFound = pageNum;
    }
  });

  const totalPages = maxPageFound > 1 ? maxPageFound : Math.ceil(totalClasses / 100) || 1;

  const items: ScrapedScheduleItem[] = [];

  $('tr.table-content').each((_, el) => {
    const tds = $(el).find('td');
    if (tds.length < 5) return;

    const noStr = $(tds[0]).text().trim();
    const no = parseInt(noStr, 10) || 0;

    // Tanggal & Waktu: "Senin, 13 April 2026 08:00"
    const rawDateTime = $(tds[1]).text().trim().replace(/\s+/g, ' ');
    let hari = '';
    let tanggal = '';
    let waktuMulai = '';

    const commaIndex = rawDateTime.indexOf(',');
    if (commaIndex !== -1) {
      hari = rawDateTime.substring(0, commaIndex).trim();
      const afterComma = rawDateTime.substring(commaIndex + 1).trim();
      // Pisahkan tanggal dan jam: "13 April 2026 08:00"
      const lastSpaceIndex = afterComma.lastIndexOf(' ');
      if (lastSpaceIndex !== -1) {
        tanggal = afterComma.substring(0, lastSpaceIndex).trim();
        waktuMulai = afterComma.substring(lastSpaceIndex + 1).trim();
      } else {
        tanggal = afterComma;
      }
    } else {
      tanggal = rawDateTime;
    }

    // Dosen & Matakuliah
    const tdDosenMatkul = $(tds[2]);
    const dosen = tdDosenMatkul.find('span.font-weight-bold').text().trim();

    // Text kelas & matkul: "01PS2 :: Pemrograman Berorientasi Objek"
    const rawMatkulDiv = tdDosenMatkul.children('div').last().text().trim();
    let kodeKelas = '';
    let mataKuliah = '';

    if (rawMatkulDiv.includes('::')) {
      const parts = rawMatkulDiv.split('::').map((s) => s.trim());
      kodeKelas = parts[0] || '';
      mataKuliah = parts[1] || '';
    } else {
      mataKuliah = rawMatkulDiv;
    }

    // Ruang: "Kampus Thehok, Labor 1.5"
    const rawRuang = $(tds[3]).text().trim();
    let kampus = '';
    let ruangLabor = '';

    if (rawRuang.includes(',')) {
      const parts = rawRuang.split(',').map((s) => s.trim());
      kampus = parts[0] || '';
      ruangLabor = parts.slice(1).join(', ').trim();
    } else {
      kampus = 'Kampus Thehok';
      ruangLabor = rawRuang;
    }

    // Status: ambil hanya teks status (buang <sup> "Updated By: ..." dsb.)
    const tdStatus = $(tds[4]).clone();
    tdStatus.find('sup').remove();
    const status = tdStatus
      .text()
      .replace(/Updated By:.*$/i, '')
      .trim()
      .replace(/\s+/g, ' ');

    items.push({
      no,
      hari,
      tanggal,
      waktuMulai,
      dosen,
      kodeKelas,
      mataKuliah,
      kampus,
      ruangLabor,
      status,
    });
  });

  return {
    page,
    totalPages,
    totalClasses,
    items,
  };
}
