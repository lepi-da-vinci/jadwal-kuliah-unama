// Auto-bypass Ngrok Free Warning Page for API calls
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  options = options || {};
  options.headers = options.headers || {};
  if (options.headers instanceof Headers) {
    if (!options.headers.has('ngrok-skip-browser-warning')) {
      options.headers.set('ngrok-skip-browser-warning', 'true');
    }
  } else if (Array.isArray(options.headers)) {
    options.headers.push(['ngrok-skip-browser-warning', 'true']);
  } else {
    options.headers['ngrok-skip-browser-warning'] = 'true';
  }
  return originalFetch(url, options);
};

// ==================== DOM XSS SANITIZATION (SEC-08) ====================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function selectAslabItem(element, value) {
  document.getElementById('aslab-select').value = value;
  const items = document.querySelectorAll('#aslab-list-container .aslab-list-item');
  items.forEach(item => item.classList.remove('active'));
  element.classList.add('active');
}

// Custom Select Dropdown Logic
function toggleCustomSelect(id, event) {
  event.stopPropagation();
  const dropdown = document.getElementById(`dropdown-${id}`);
  const isCurrentlyOpen = dropdown.classList.contains('open');

  // Close all other open dropdowns
  document.querySelectorAll('.custom-select-dropdown.open').forEach(el => {
    el.classList.remove('open');
  });

  if (!isCurrentlyOpen) {
    dropdown.classList.add('open');
  }
}

function selectCustomOption(id, value, label) {
  const filterInput = document.getElementById(`filter-${id}`);
  if (filterInput) filterInput.value = value;

  const labelEl = document.getElementById(`label-${id}`);
  if (labelEl) labelEl.innerText = label;

  const items = document.querySelectorAll(`#dropdown-${id} .aslab-list-item`);
  items.forEach(item => {
    const itemVal = item.getAttribute('data-value') || item.innerText.trim();
    if (itemVal === value || (value === 'semua' && (itemVal === 'semua' || itemVal.startsWith('Semua')))) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Close the dropdown
  const dropdown = document.getElementById(`dropdown-${id}`);
  if (dropdown) dropdown.classList.remove('open');

  // Trigger applyFilters or update dynamic options if necessary
  if (id === 'kampus' || id === 'kategori-ruang' || id === 'waktu' || id === 'metode') {
    updateRuanganFilterOptions();
    if (typeof updateActiveLabPanel === 'function') updateActiveLabPanel();
  }
  applyFilters();
}

// Close dropdowns when clicking outside
document.addEventListener('click', (event) => {
  document.querySelectorAll('.custom-select-dropdown.open').forEach(el => {
    el.classList.remove('open');
  });
});

// Keyboard support for Custom Selects (Enter, Space, Arrow Keys, Escape)
document.addEventListener('keydown', (e) => {
  const activeEl = document.activeElement;
  if (!activeEl) return;

  // Jika sedang fokus pada trigger select custom
  if (activeEl.classList && activeEl.classList.contains('custom-select-trigger')) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeEl.click();
      const wrapper = activeEl.closest('.custom-select-wrapper');
      const dropdown = wrapper ? wrapper.querySelector('.custom-select-dropdown') : null;
      if (dropdown && dropdown.classList.contains('open')) {
        const activeItem = dropdown.querySelector('.aslab-list-item.active') || dropdown.querySelector('.aslab-list-item');
        if (activeItem) {
          activeItem.setAttribute('tabindex', '0');
          activeItem.focus();
        }
      }
    }
  }
  // Jika sedang fokus pada item opsi di dalam dropdown
  else if (activeEl.classList && activeEl.classList.contains('aslab-list-item')) {
    const dropdown = activeEl.closest('.custom-select-dropdown');
    if (dropdown) {
      const items = Array.from(dropdown.querySelectorAll('.aslab-list-item'));
      const currentIndex = items.indexOf(activeEl);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex].setAttribute('tabindex', '0');
        items[nextIndex].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        items[prevIndex].setAttribute('tabindex', '0');
        items[prevIndex].focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activeEl.click();
        const wrapper = dropdown.closest('.custom-select-wrapper');
        const trigger = wrapper ? wrapper.querySelector('.custom-select-trigger') : null;
        if (trigger) trigger.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dropdown.classList.remove('open');
        const wrapper = dropdown.closest('.custom-select-wrapper');
        const trigger = wrapper ? wrapper.querySelector('.custom-select-trigger') : null;
        if (trigger) trigger.focus();
      }
    }
  }
});

const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://127.0.0.1:8000' : window.location.origin;
let allJadwal = [];
let allRuanganData = [];

async function fetchAllRuangan() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ruangan?_t=${Date.now()}`);
    const result = await response.json();
    if (result.status === 'success') {
      allRuanganData = result.data;
      updateActiveLabPanel();
    }
  } catch (e) { console.error("Gagal load ruangan", e); }
}
fetchAllRuangan();

const tbody = document.getElementById('jadwal-tbody');
const filterTanggal = document.getElementById('filter-tanggal');
const filterWaktu = document.getElementById('filter-waktu');
const filterMetode = document.getElementById('filter-metode');
const filterRuangan = document.getElementById('filter-ruangan');
const infoSekarang = document.getElementById('info-jadwal-sekarang');

let notifScrollInterval = null;
const scrollContainer = document.getElementById('notif-scroll-container');

function startNotifScroll() {
  stopNotifScroll();
  if (!scrollContainer) return;
  if (scrollContainer.scrollHeight > scrollContainer.clientHeight) {
    notifScrollInterval = setInterval(() => {
      let oldScroll = scrollContainer.scrollTop;
      scrollContainer.scrollTop += 1;

      if (scrollContainer.scrollTop <= oldScroll) {
        scrollContainer.scrollTop = 0;
      }
    }, 50);
  }
}

function stopNotifScroll() {
  if (notifScrollInterval) {
    clearInterval(notifScrollInterval);
    notifScrollInterval = null;
  }
}

if (scrollContainer) {
  scrollContainer.addEventListener('mouseenter', stopNotifScroll);
  scrollContainer.addEventListener('mouseleave', () => {
    if (document.getElementById('notifikasi-lab-list').innerHTML.includes('notif-item')) {
      startNotifScroll();
    }
  });
}

function updateStats(data) {
  const container = document.getElementById('stat-container');
  if (data.length === 0) {
    container.innerHTML = '<div class="stat-badge">Tidak ada data</div>';
    return;
  }
  let tmCount = 0, olCount = 0, ccCount = 0;
  data.forEach(item => {
    if (item.metode_pembelajaran === 'TM') tmCount++;
    else if (item.metode_pembelajaran === 'OL') olCount++;
    else if (item.metode_pembelajaran === 'CC') ccCount++;
  });
  container.innerHTML = `
        <div class="stat-badge tm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          TM: ${tmCount} Kelas
        </div>
        <div class="stat-badge ol">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          OL: ${olCount} Kelas
        </div>
        <div class="stat-badge cc">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          CC: ${ccCount} Kelas
        </div>
      `;
}

function showSkeleton() {
  const rows = Array.from({ length: 5 }, () =>
    `<tr class="skeleton-row">${'<td class="skeleton">Memuat</td>'.repeat(6)}</tr>`
  ).join('');
  tbody.innerHTML = rows;
}

async function fetchAllJadwal() {
  try {
    showSkeleton();
    const response = await fetch(`${API_BASE_URL}/api/jadwal?_t=${Date.now()}`);
    const data = await response.json();
    if (data.status === 'success') {
      allJadwal = data.data.map(item => {
        if (item.nama_ruangan) item.nama_ruangan = item.nama_ruangan.trim();
        return item;
      });
      populateFilters();
      applyFilters();
    } else {
      if (!filterTanggal.value) { applyFilters(); }
      else { tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--badge-cc);">Gagal memuat data jadwal: ${data.message}</td></tr>`; }
    }
  } catch (e) {
    if (!filterTanggal.value) { applyFilters(); }
    else { tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:var(--badge-cc);">Gagal memuat data jadwal.</td></tr>'; }
  }
}

fetchAllJadwal();

function updateRuanganFilterOptions() {
  const dropdownRuangan = document.getElementById('dropdown-ruangan').querySelector('.aslab-list-container') || document.getElementById('dropdown-ruangan');
  const hiddenInput = document.getElementById('filter-ruangan');
  const oldVal = hiddenInput.value;

  const fKampus = document.getElementById('filter-kampus').value;
  const filterKat = document.getElementById('filter-kategori-ruang').value;
  const fTanggal = document.getElementById('filter-tanggal').value;
  const fWaktu = document.getElementById('filter-waktu').value;
  const fMetode = document.getElementById('filter-metode').value;

  const ruanganSet = new Set();

  allJadwal.forEach(item => {
    if (!item.nama_ruangan) return;
    if (fKampus !== 'semua' && (!item.kampus || item.kampus.trim() !== fKampus)) return;
    if (fTanggal && item.tanggal !== fTanggal) return;
    if (fMetode !== 'semua' && item.metode_pembelajaran !== fMetode) return;

    if (fWaktu !== 'semua' && fWaktu !== 'sekarang') {
      if (item.jam !== fWaktu) return;
    } else if (fWaktu === 'sekarang') {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      if (!item.jam) return;
      const parts = item.jam.split(':');
      const startTime = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      if (!(currentTime >= startTime && currentTime <= startTime + 135)) return;
    }

    if (filterKat === 'semua') {
      ruanganSet.add(item.nama_ruangan);
    } else if (filterKat === 'labor') {
      if (isLab(item.nama_ruangan)) ruanganSet.add(item.nama_ruangan);
    } else if (filterKat === 'kelas') {
      if (!isLab(item.nama_ruangan)) ruanganSet.add(item.nama_ruangan);
    }
  });

  let html = `<div class="aslab-list-item active" onclick="selectCustomOption('ruangan', 'semua', 'Semua Ruangan')">Semua Ruangan</div>`;

  let foundOld = false;
  Array.from(ruanganSet).sort().forEach(r => {
    if (r === oldVal) foundOld = true;
    html += `<div class="aslab-list-item" onclick="selectCustomOption('ruangan', '${r}', '${r}')">${r}</div>`;
  });

  dropdownRuangan.innerHTML = html;

  if (foundOld) {
    hiddenInput.value = oldVal;
    document.getElementById('label-ruangan').innerText = oldVal;
    if (oldVal !== 'semua') {
      dropdownRuangan.children[0].classList.remove('active');
    }
  } else {
    hiddenInput.value = 'semua';
    document.getElementById('label-ruangan').innerText = 'Semua Ruangan';
    dropdownRuangan.children[0].classList.add('active');
  }
}

function populateFilters() {
  const waktuSet = new Set();
  allJadwal.forEach(item => { if (item.jam) waktuSet.add(item.jam); });

  // Update Waktu dropdown list
  const dropdownWaktu = document.getElementById('dropdown-waktu');
  dropdownWaktu.innerHTML = `<div class="aslab-list-item active" onclick="selectCustomOption('waktu', 'semua', 'Semua Waktu')">Semua Waktu</div>
                                <div class="aslab-list-item" onclick="selectCustomOption('waktu', 'sekarang', 'Jadwal Saat Ini')">Jadwal Saat Ini (Otomatis)</div>`;
  Array.from(waktuSet).sort().forEach(waktu => {
    dropdownWaktu.innerHTML += `<div class="aslab-list-item" onclick="selectCustomOption('waktu', '${waktu}', 'Pukul ${waktu}')">Pukul ${waktu}</div>`;
  });

  updateRuanganFilterOptions();
}

function renderTable(data) {
  window._currentFilteredJadwal = data;
  const hasilLabel = document.getElementById('hasil-pencarian');
  hasilLabel.innerHTML = `Hasil Pencarian: <strong style="color:var(--primary);">${data.length} jadwal</strong> ditemukan`;
  tbody.innerHTML = '';
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada jadwal yang sesuai dengan filter.</td></tr>';
    return;
  }
  data.forEach(item => {
    let badgeClass = 'default';
    if (item.metode_pembelajaran === 'TM') badgeClass = 'tm';
    else if (item.metode_pembelajaran === 'OL') badgeClass = 'ol';
    else if (item.metode_pembelajaran === 'CC') badgeClass = 'cc';
    let displayStatus = item.status_jadwal || '';
    if (item.metode_pembelajaran === 'OL') {
      displayStatus = 'Online';
    }
    const row = document.createElement('tr');
    const safeItemJson = escapeHtml(JSON.stringify(item));
    row.innerHTML = `
          <td><strong>${escapeHtml(item.jam)}</strong><br><small>${escapeHtml(item.hari)}, ${escapeHtml(item.tanggal_format || item.tanggal)}</small></td>
          <td>
            ${escapeHtml(item.nama_mk || '-')} 
            ${item.kelas ? `<br><small style="color:var(--badge-tm);font-weight:bold;">(Kelas: ${escapeHtml(item.kelas)})</small>` : ''}
            <div>
              <button class="btn-cal-mini" data-item="${safeItemJson}" onclick="handleSingleCalClick(this)" title="Simpan jadwal kuliah ini ke Google Calendar">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                + Google Calendar
              </button>
            </div>
          </td>
          <td>${escapeHtml(item.nama_dosen || '-')}</td>
          <td>${escapeHtml(item.nama_ruangan || '-')}</td>
          <td>${escapeHtml(displayStatus)}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(item.metode_pembelajaran)}</span></td>
        `;
    tbody.appendChild(row);
  });
}

function handleSingleCalClick(btn) {
  try {
    const raw = btn.getAttribute('data-item');
    const parser = new DOMParser();
    const decoded = parser.parseFromString(raw, 'text/html').body.textContent;
    const item = JSON.parse(decoded);
    openSingleGoogleCalendar(item);
  } catch (err) {
    console.error('Gagal membuka kalender:', err);
  }
}

function isLab(namaRuangan) {
  if (!namaRuangan) return false;
  const name = namaRuangan.toLowerCase();
  return name.includes('lab') || name.includes('praktek');
}

function applyFilters() {
  const ft = filterTanggal.value;
  if (!ft) {
    document.getElementById('hasil-pencarian').innerHTML = '<em>Pilih tanggal dulu mas.</em>';
    document.getElementById('jadwal-table-body').innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 1.1em;"><em style="display:inline-flex; align-items:center; gap:8px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Pilih tanggal dulu mas untuk mulai mencari jadwal</em></td></tr>';
    document.getElementById('active-lab-list').innerHTML = '<div style="padding:10px; color:var(--text-muted); font-style:italic;">Pilih tanggal dulu mas...</div>';
    document.getElementById('active-room-list').innerHTML = '<div style="padding:10px; color:var(--text-muted); font-style:italic;">Pilih tanggal dulu mas...</div>';

    const statTm = document.getElementById('stat-tm');
    const statOl = document.getElementById('stat-ol');
    const statCc = document.getElementById('stat-cc');
    if (statTm) statTm.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> TM: 0 Kelas`;
    if (statOl) statOl.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> OL: 0 Kelas`;
    if (statCc) statCc.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> CC: 0 Kelas`;
    return;
  }

  fetchNotifikasiLab(ft);

  const fw = filterWaktu.value;
  const fm = filterMetode.value;
  const fr = filterRuangan.value;
  const fk = document.getElementById('filter-kategori-ruang').value;
  const fKampus = document.getElementById('filter-kampus').value;

  let filtered = allJadwal;
  infoSekarang.style.display = 'none';

  if (ft) filtered = filtered.filter(item => item.tanggal === ft);

  if (fw === 'sekarang') {
    infoSekarang.style.display = 'flex';
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    filtered = filtered.filter(item => {
      if (!item.jam) return false;
      const parts = item.jam.split(':');
      const startTime = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      return (currentTime >= startTime) && (currentTime <= startTime + 135);
    });
  } else if (fw !== 'semua') {
    filtered = filtered.filter(item => item.jam === fw);
  }

  if (fm !== 'semua') filtered = filtered.filter(item => item.metode_pembelajaran === fm);
  if (fr !== 'semua') filtered = filtered.filter(item => item.nama_ruangan === fr);
  if (fk === 'labor') filtered = filtered.filter(item => isLab(item.nama_ruangan));
  else if (fk === 'kelas') filtered = filtered.filter(item => !isLab(item.nama_ruangan));
  if (fKampus !== 'semua') filtered = filtered.filter(item => item.kampus && item.kampus.trim() === fKampus);

  filtered.sort((a, b) => {
    const aIsLab = isLab(a.nama_ruangan);
    const bIsLab = isLab(b.nama_ruangan);
    if (aIsLab && !bIsLab) return -1;
    if (!aIsLab && bIsLab) return 1;
    if (a.jam && b.jam) { if (a.jam < b.jam) return -1; if (a.jam > b.jam) return 1; }
    return 0;
  });

  updateStats(filtered);
  renderTable(filtered);
  updateActiveLabPanel();
}

function updateActiveLabPanel() {
  const labPanel = document.getElementById('active-lab-list');
  const roomPanel = document.getElementById('active-room-list');
  const labPanelContainer = document.getElementById('active-lab-panel');
  const roomPanelContainer = document.getElementById('active-room-panel');
  if (!labPanel || !roomPanel) return;

  const kampusFilter = document.getElementById('filter-kampus') ? document.getElementById('filter-kampus').value : 'semua';
  const kategoriFilter = document.getElementById('filter-kategori-ruang') ? document.getElementById('filter-kategori-ruang').value : 'semua';

  if (kategoriFilter === 'labor') {
    labPanelContainer.style.display = 'flex';
    roomPanelContainer.style.display = 'none';
  } else if (kategoriFilter === 'kelas') {
    labPanelContainer.style.display = 'none';
    roomPanelContainer.style.display = 'flex';
  } else {
    labPanelContainer.style.display = 'flex';
    roomPanelContainer.style.display = 'flex';
  }

  const now = new Date();
  const currentDayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const filterTanggal = document.getElementById('filter-tanggal');
  const activeDate = (filterTanggal && filterTanggal.value) ? filterTanggal.value : currentDayStr;
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const isToday = (activeDate === currentDayStr);

  const filterRuangan = document.getElementById('filter-ruangan') ? document.getElementById('filter-ruangan').value : 'semua';
  const filterMetode = document.getElementById('filter-metode') ? document.getElementById('filter-metode').value : 'semua';

  let labsThehok = {};
  let labsKobar = {};
  let roomsThehok = {};
  let roomsKobar = {};

  let roomSchedules = {};

  // 1. Group schedules by room
  allJadwal.forEach(item => {
    if (item.tanggal === activeDate && item.jam && item.metode_pembelajaran !== 'CC' && item.metode_pembelajaran !== 'OL') {
      if (filterRuangan !== 'semua' && item.nama_ruangan !== filterRuangan) return;
      if (filterMetode !== 'semua' && item.metode_pembelajaran !== filterMetode) return;

      const parts = item.jam.split(':');
      const startTime = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);

      if (!roomSchedules[item.nama_ruangan]) roomSchedules[item.nama_ruangan] = [];
      roomSchedules[item.nama_ruangan].push({
        start: startTime,
        end: startTime + 135,
        nama: item.nama_mk,
        jam: item.jam
      });
    }
  });

  // 2. Determine state for each room in the database
  allRuanganData.forEach(r => {
    if (filterRuangan !== 'semua' && r.nama_ruangan !== filterRuangan) return;

    let rawName = r.nama_ruangan;
    let isThehok = true;
    if (rawName.includes("(Kampus Kobar)") || (r.kampus && r.kampus.toLowerCase().includes("kobar"))) {
      isThehok = false;
    }
    let cleanName = rawName.replace(/ \(Kampus.*?\)/, "");
    let isRoomLab = isLab(rawName);

    let targetDict = isRoomLab ? (isThehok ? labsThehok : labsKobar) : (isThehok ? roomsThehok : roomsKobar);

    let state = 'empty'; // empty (red), waiting (orange), occupied (green)
    let text = 'Kosong';
    let jamText = '';

    let schedules = roomSchedules[rawName] || [];

    // Sort schedules by start time
    schedules.sort((a, b) => a.start - b.start);

    let isOccupied = false;
    let hasFutureClass = false;
    let activeClass = null;
    let nextClass = null;

    if (isToday) {
      for (const s of schedules) {
        if (currentTime >= s.start && currentTime <= s.end) {
          isOccupied = true;
          activeClass = s;
          break;
        } else if (currentTime < s.start) {
          hasFutureClass = true;
          if (!nextClass) nextClass = s; // First future class
        }
      }
    }

    if (isOccupied) {
      state = 'occupied';
      text = activeClass.nama;
      jamText = activeClass.jam;
    } else if (hasFutureClass) {
      state = 'waiting';
      text = 'Jeda';
      jamText = `(Buka: ${nextClass.jam})`;
    } else if (!isToday && schedules.length > 0) {
      state = 'scheduled';
      text = 'Terjadwal';
      jamText = `(${schedules.length} Kelas)`;
    }

    targetDict[cleanName] = { state, text, jamText };
  });

  // Handle rooms that are in schedule but not in allRuanganData (e.g., specific regular rooms)
  Object.keys(roomSchedules).forEach(rawName => {
    // Check if already processed in allRuanganData
    if (allRuanganData.some(r => r.nama_ruangan === rawName)) return;

    let isThehok = true;
    if (rawName.includes("(Kampus Kobar)")) isThehok = false; // Fallback check

    let cleanName = rawName.replace(/ \(Kampus.*?\)/, "");
    let isRoomLab = isLab(rawName);

    let targetDict = isRoomLab ? (isThehok ? labsThehok : labsKobar) : (isThehok ? roomsThehok : roomsKobar);

    let state = 'empty';
    let text = 'Kosong';
    let jamText = '';

    let schedules = roomSchedules[rawName];
    schedules.sort((a, b) => a.start - b.start);

    let isOccupied = false;
    let hasFutureClass = false;
    let activeClass = null;
    let nextClass = null;

    if (isToday) {
      for (const s of schedules) {
        if (currentTime >= s.start && currentTime <= s.end) {
          isOccupied = true;
          activeClass = s;
          break;
        } else if (currentTime < s.start) {
          hasFutureClass = true;
          if (!nextClass) nextClass = s;
        }
      }
    }

    if (isOccupied) {
      state = 'occupied';
      text = activeClass.nama;
      jamText = activeClass.jam;
    } else if (hasFutureClass) {
      state = 'waiting';
      text = 'Jeda';
      jamText = `(Buka: ${nextClass.jam})`;
    } else if (!isToday && schedules.length > 0) {
      state = 'scheduled';
      text = 'Terjadwal';
      jamText = `(${schedules.length} Kelas)`;
    }

    targetDict[cleanName] = { state, text, jamText };
  });

  // Live warnings for both Labor and Ruang Kelas
  currentLabWarnings = [];
  currentRuangWarnings = [];
  if (isToday) {
    for (const [room, schedules] of Object.entries(roomSchedules)) {
      if (!schedules || schedules.length === 0) continue;
      const startTimes = schedules.map(s => s.start);
      const lastStartTime = Math.max(...startTimes);
      const lastClassEndTime = lastStartTime + 135;
      const minsLeft = lastClassEndTime - currentTime;

      if (minsLeft >= 0 && minsLeft <= 30) {
        const color = minsLeft <= 15 ? 'var(--badge-cc)' : '#f39c12';
        const h = Math.floor(lastClassEndTime / 60).toString().padStart(2, '0');
        const m = (lastClassEndTime % 60).toString().padStart(2, '0');
        const roomIsLab = isLab(room);
        const titleText = roomIsLab ? `TUTUP LABOR (${minsLeft} mnt lagi)` : `SELESAI KELAS (${minsLeft} mnt lagi)`;
        const badgeHTML = roomIsLab 
          ? `<span class="notif-cat-badge labor">Labor</span>` 
          : `<span class="notif-cat-badge kelas">Kelas</span>`;

        const itemHTML = `
          <div class="notif-item" style="border-left: 4px solid ${color};">
            <div class="notif-header">
              <div style="display:flex; align-items:center;">
                <span class="notif-type" style="color: ${color}; font-weight:bold;">${titleText}</span>
                ${badgeHTML}
              </div>
            </div>
            <div class="notif-message">Kelas terakhir di <b>${room}</b> selesai pada ${h}:${m}.</div>
          </div>
        `;

        if (roomIsLab) {
          currentLabWarnings.push(itemHTML);
        } else {
          currentRuangWarnings.push(itemHTML);
        }
      }
    }
  }

  const activeWarnings = activeInfoMaseTab === 'ruang' ? currentRuangWarnings : currentLabWarnings;
  const warningsHTML = activeWarnings.join('');
  const liveWarningsContainer = document.getElementById('live-warnings');
  const fsWarnings = document.getElementById('fs-live-warnings');
  if (liveWarningsContainer) liveWarningsContainer.innerHTML = warningsHTML;
  if (fsWarnings) fsWarnings.innerHTML = warningsHTML;

  const renderBlocks = (dict, kampusStr) => {
    const sortedRooms = Object.keys(dict).sort();
    let html = '<div class="lab-grid">';
    for (const room of sortedRooms) {
      const data = dict[room];
      html += `
              <div class="lab-card ${data.state}" onclick="showRoomDetail('${room}', '${kampusStr}')">
                <div class="lab-name">${room}</div>
                <div class="lab-status">${data.state === 'empty' ? 'Kosong' : data.text + ' ' + data.jamText}</div>
              </div>
            `;
    }
    html += '</div>';
    return html;
  };

  // Render Lab Panel
  let htmlLab = '';
  if ((kampusFilter === 'semua' || kampusFilter === 'Kampus Thehok') && Object.keys(labsThehok).length > 0) {
    htmlLab += `<div><div class="lab-section-title">Thehok</div>${renderBlocks(labsThehok, 'Thehok')}</div>`;
  }
  if ((kampusFilter === 'semua' || kampusFilter === 'Kampus Kobar') && Object.keys(labsKobar).length > 0) {
    htmlLab += `<div><div class="lab-section-title">Kobar</div>${renderBlocks(labsKobar, 'Kobar')}</div>`;
  }
  if (htmlLab === '') htmlLab = '<em>Tidak ada lab yang sesuai.</em>';
  labPanel.innerHTML = htmlLab;

  // Render Room Panel
  let htmlRoom = '';
  if ((kampusFilter === 'semua' || kampusFilter === 'Kampus Thehok') && Object.keys(roomsThehok).length > 0) {
    htmlRoom += `<div><div class="lab-section-title">Thehok</div>${renderBlocks(roomsThehok, 'Thehok')}</div>`;
  }
  if ((kampusFilter === 'semua' || kampusFilter === 'Kampus Kobar') && Object.keys(roomsKobar).length > 0) {
    htmlRoom += `<div><div class="lab-section-title">Kobar</div>${renderBlocks(roomsKobar, 'Kobar')}</div>`;
  }
  if (htmlRoom === '') htmlRoom = '<em>Tidak ada ruangan yang sesuai.</em>';
  roomPanel.innerHTML = htmlRoom;
}

setInterval(updateActiveLabPanel, 60000);

let isCurrentlySyncing = false;

function resetSyncBtn() {
  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) {
    syncBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          Sinkronisasi
        `;
    syncBtn.disabled = false;
  }
}

async function syncData(tanggal) {
  if (isCurrentlySyncing) {
    console.log("Sinkronisasi sedang berjalan, mengabaikan pemicu duplikat...");
    return;
  }
  isCurrentlySyncing = true;

  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) {
    syncBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
          Menarik Data...
        `;
    syncBtn.disabled = true;
  }

  const tgl = tanggal || document.getElementById('filter-tanggal')?.value || '';
  const targetUrl = `https://baak.unama.ac.id/jadwal-kuliah?search=1&tanggal=${tgl}&auto_close=1`;

  // Tampilkan indikator scraping pada tabel jika data untuk tanggal ini belum ada di memori
  const existingForDate = allJadwal.filter(j => j.tanggal === tgl);
  if (tgl && existingForDate.length === 0 && tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 40px 20px; color: var(--primary); font-weight: 500;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
        <span>Sedang meminta Server melakukan scraping jadwal tanggal <b>${tgl}</b> dari BAAK...</span>
      </div>
    </td></tr>`;
  }

  // Kirim pesan ke background Chrome Extension via bridge (tab dibuka di background jika ekstensi ada di browser ini)
  window.postMessage({ type: "START_UNAMA_SYNC", url: targetUrl }, "*");

  try {
    const response = await fetch(`${API_BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tanggal: tgl || null, from_dashboard: true })
    });
    const result = await response.json();

    if (syncBtn) {
      syncBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
            Merender...
          `;
    }

    await fetchAllJadwal();
    if (tgl) {
      await fetchNotifikasiLab(tgl, false);
    }
  } catch (error) {
    console.error("Error saat sinkronisasi:", error);
  } finally {
    isCurrentlySyncing = false;
    resetSyncBtn();
  }
}

let latestNotifikasiLabData = [];
let activeInfoMaseTab = 'lab'; // 'lab' | 'ruang'
let currentLabWarnings = [];
let currentRuangWarnings = [];

function isLabNotification(pesan = '') {
  const p = String(pesan).toLowerCase();
  return p.includes('labor') || p.includes('lab ') || p.includes('lab.') || p.includes('praktek') || p.includes('cisco');
}

function calculateClientSideGaps(targetDate) {
  if (!targetDate || !allJadwal || allJadwal.length === 0) return [];
  const roomSchedules = {};
  allJadwal.forEach(item => {
    if (item.tanggal === targetDate && item.jam && item.nama_ruangan && item.metode_pembelajaran !== 'CC') {
      const ruang = item.nama_ruangan;
      if (!roomSchedules[ruang]) roomSchedules[ruang] = [];
      const parts = item.jam.split(':');
      const startMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      roomSchedules[ruang].push({
        jam: item.jam,
        nama_mk: item.nama_mk,
        start: startMin,
        end: startMin + 135
      });
    }
  });

  const generatedGaps = [];
  for (const [room, scheds] of Object.entries(roomSchedules)) {
    scheds.sort((a, b) => a.start - b.start);
    for (let i = 0; i < scheds.length - 1; i++) {
      const curr = scheds[i];
      const nxt = scheds[i+1];
      const gap = nxt.start - curr.end;
      if (gap >= 90) {
        const hours = Math.floor(gap / 60);
        const mins = gap % 60;
        const durStr = `${hours} jam` + (mins > 0 ? ` ${mins} menit` : '');
        const eh = Math.floor(curr.end / 60).toString().padStart(2, '0');
        const em = (curr.end % 60).toString().padStart(2, '0');
        generatedGaps.push({
          tipe_notif: 'JEDA',
          pesan: `JEDA PANJANG (${durStr}): Ruang ${room} kosong antara ${eh}:${em} s/d ${nxt.jam}.`,
          waktu: 'Otomatis'
        });
      }
    }
  }
  return generatedGaps;
}

function updateInfoMaseDynamicButtons(notifs = []) {
  latestNotifikasiLabData = notifs;
  const toggleBtn = document.getElementById('toggle-notif-btn');
  const fsInfoBtn = document.getElementById('btn-fs-info-modal');
  const buttons = [toggleBtn, fsInfoBtn].filter(Boolean);

  let hasTambahan = false;
  let hasPerubahan = false;
  let hasJeda = false;

  notifs.forEach(n => {
    if (n.tipe_notif === 'TAMBAHAN') hasTambahan = true;
    else if (n.tipe_notif === 'PERUBAHAN') hasPerubahan = true;
    else if (n.tipe_notif === 'JEDA') hasJeda = true;
  });

  buttons.forEach(btn => {
    btn.classList.remove('state-tambahan', 'state-perubahan', 'state-jeda', 'state-normal');
    const badge = btn.querySelector('.notif-badge-count');

    if (notifs.length > 0) {
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.textContent = notifs.length;
      }

      if (hasTambahan) {
        btn.classList.add('state-tambahan');
        btn.title = `${notifs.length} Notifikasi (Ada Kelas Tambahan)`;
      } else if (hasPerubahan) {
        btn.classList.add('state-perubahan');
        btn.title = `${notifs.length} Notifikasi (Ada Perubahan Jadwal)`;
      } else if (hasJeda) {
        btn.classList.add('state-jeda');
        btn.title = `${notifs.length} Notifikasi (Ada Jeda Ruangan/Lab Kosong)`;
      }
    } else {
      btn.classList.add('state-normal');
      btn.title = 'Info Mase (Tidak ada notifikasi khusus)';
      if (badge) badge.style.display = 'none';
    }
  });
}

window.switchInfoMaseTab = function (tab) {
  activeInfoMaseTab = tab;

  // Update active state on all tab buttons across panel and modal
  document.querySelectorAll('.info-mase-tab-btn').forEach(btn => {
    const btnTab = btn.getAttribute('data-tab');
    btn.classList.toggle('active', btnTab === tab);
  });

  renderInfoMaseNotifications(false);
};

let activeInfoMaseKampus = 'semua';

window.switchInfoMaseKampus = function (kampus) {
  activeInfoMaseKampus = kampus;

  // Update button active states
  document.querySelectorAll('.info-mase-kampus-btn').forEach(btn => {
    const btnKampus = btn.getAttribute('data-kampus');
    if (btnKampus === kampus) {
      btn.classList.add('active');
      btn.style.background = 'var(--bg-card)';
      btn.style.color = 'var(--text)';
      btn.style.boxShadow = 'var(--shadow-sm)';
    } else {
      btn.classList.remove('active');
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-muted)';
      btn.style.boxShadow = 'none';
    }
  });

  renderInfoMaseNotifications(false);
};

function renderInfoMaseNotifications(showPopup = false) {
  const panelList = document.getElementById('notifikasi-lab-list');
  const fsList = document.getElementById('fs-notifikasi-lab-list');

  // Filter by Kampus First
  let filteredByKampus = latestNotifikasiLabData.filter(n => {
    if (activeInfoMaseKampus === 'semua') return true;
    const msg = n.pesan.toLowerCase();
    if (activeInfoMaseKampus === 'thehok') return msg.includes('thehok');
    if (activeInfoMaseKampus === 'kobar') return msg.includes('kobar');
    return true; // if no campus identifier, show it
  });

  const labCount = filteredByKampus.filter(n => isLabNotification(n.pesan)).length;
  const ruangCount = filteredByKampus.filter(n => !isLabNotification(n.pesan)).length;

  // Update badges on buttons
  const badges = [
    { id: 'fs-tab-badge-lab', count: labCount },
    { id: 'panel-tab-badge-lab', count: labCount },
    { id: 'fs-tab-badge-ruang', count: ruangCount },
    { id: 'panel-tab-badge-ruang', count: ruangCount },
  ];

  badges.forEach(({ id, count }) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  });

  // Render live warnings according to active tab
  const activeWarnings = activeInfoMaseTab === 'ruang' ? currentRuangWarnings : currentLabWarnings;
  
  // Filter live warnings based on active campus filter
  let filteredWarnings = activeWarnings;
  if (activeInfoMaseKampus !== 'semua') {
    filteredWarnings = activeWarnings.filter(wHtml => {
       const lowHtml = wHtml.toLowerCase();
       return lowHtml.includes(activeInfoMaseKampus);
    });
  }

  const warningsHTML = filteredWarnings.join('');
  const liveWarningsContainer = document.getElementById('live-warnings');
  const fsWarnings = document.getElementById('fs-live-warnings');
  if (liveWarningsContainer) liveWarningsContainer.innerHTML = warningsHTML;
  if (fsWarnings) fsWarnings.innerHTML = warningsHTML;

  // Filter list based on selected active tab (default 'lab', or 'ruang')
  let filtered = filteredByKampus.filter(n => {
    return activeInfoMaseTab === 'ruang' ? !isLabNotification(n.pesan) : isLabNotification(n.pesan);
  });

  if (filtered.length === 0) {
    const emptyMsg = activeInfoMaseTab === 'ruang'
      ? '<em>Tidak ada notifikasi khusus untuk Ruang Kelas pada tanggal ini.</em>'
      : '<em>Tidak ada notifikasi khusus untuk Laboratorium pada tanggal ini.</em>';

    if (panelList) panelList.innerHTML = emptyMsg;
    if (fsList) fsList.innerHTML = emptyMsg;
    return;
  }

  let html = '', popupContent = '';
  filtered.forEach(n => {
    let cls = '';
    const isLab = isLabNotification(n.pesan);
    const categoryBadge = isLab 
      ? '<span class="notif-cat-badge labor">Labor</span>' 
      : '<span class="notif-cat-badge kelas">Kelas</span>';

    if (n.tipe_notif === 'TAMBAHAN') {
      cls = 'tambah';
    } else if (n.tipe_notif === 'PERUBAHAN') {
      cls = 'perubahan';
    } else if (n.tipe_notif === 'JEDA') {
      cls = 'jeda';
    }
    
    // Fix Bug Visual: Semua tipe notif dimasukkan ke popupContent, bukan cuma TAMBAHAN
    if (showPopup) {
      popupContent += `<div class="notif-item ${cls}"><strong>${n.tipe_notif}</strong><br>${n.pesan}</div>`;
    }

    html += `
      <div class="notif-item ${cls}">
        <div class="notif-header">
          <div style="display:flex; align-items:center;">
            <span>${n.tipe_notif}</span>
            ${categoryBadge}
          </div>
          <span class="notif-time">${n.waktu}</span>
        </div>
        <div>${n.pesan}</div>
      </div>
    `;
  });

  if (panelList) panelList.innerHTML = html;
  if (fsList) fsList.innerHTML = html;

  if (showPopup && popupContent) {
    const modalBody = document.getElementById('lab-modal-body');
    if (modalBody) modalBody.innerHTML = popupContent;
    openModal();
  }
}

async function fetchNotifikasiLab(tanggal, showPopup = false) {
  const notifList = document.getElementById('notifikasi-lab-list');
  if (!tanggal) {
    if (notifList) notifList.innerHTML = '<em>pilih tanggal tuk cek notif mas.</em>';
    updateInfoMaseDynamicButtons([]);
    renderInfoMaseNotifications(false);
    return;
  }
  try {
    if (notifList) notifList.innerHTML = '<em>Memuat notifikasi...</em>';
    const response = await fetch(`${API_BASE_URL}/api/notifikasi-lab?tanggal=${tanggal}&_t=${Date.now()}`);
    const data = await response.json();

    let notifData = (data.status === 'success' && data.data) ? data.data : [];
    
    // Jika dari server belum ada notif jeda tapi jadwal ada, hitung otomatis dari client-side
    const clientGaps = calculateClientSideGaps(tanggal);
    if (clientGaps.length > 0) {
      const existingMessages = new Set(notifData.map(n => n.pesan));
      clientGaps.forEach(g => {
        if (!existingMessages.has(g.pesan)) {
          notifData.push(g);
        }
      });
    }

    if (notifData.length > 0) {
      updateInfoMaseDynamicButtons(notifData);
      renderInfoMaseNotifications(showPopup);
    } else {
      updateInfoMaseDynamicButtons([]);
      renderInfoMaseNotifications(false);
    }
  } catch (e) {
    // Fallback offline / client-side calculation
    const clientGaps = calculateClientSideGaps(tanggal);
    if (clientGaps.length > 0) {
      updateInfoMaseDynamicButtons(clientGaps);
      renderInfoMaseNotifications(showPopup);
    } else {
      updateInfoMaseDynamicButtons([]);
      renderInfoMaseNotifications(false);
      if (notifList) notifList.innerHTML = '<em style="color:var(--badge-cc);">Gagal memuat notifikasi.</em>';
    }
  }
}



// Helper custom password prompt
function promptPassword(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('password-modal');
    const input = document.getElementById('admin-password-input');
    const msg = document.getElementById('password-message');
    const submitBtn = document.getElementById('password-submit-btn');
    const cancelBtn = document.getElementById('password-cancel-btn');

    msg.textContent = message;
    input.value = '';
    modal.classList.add('open');
    input.focus();

    const cleanup = () => {
      submitBtn.onclick = null;
      cancelBtn.onclick = null;
      input.onkeyup = null;
      modal.classList.remove('open');
    };

    const handleSubmit = () => {
      const val = input.value;
      cleanup();
      resolve(val);
    };

    submitBtn.onclick = handleSubmit;
    cancelBtn.onclick = () => { cleanup(); resolve(null); };
    input.onkeyup = (e) => { if (e.key === 'Enter') handleSubmit(); };
  });
}

// Helper custom danger confirm prompt
function promptConfirmDanger(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('danger-modal');
    const msg = document.getElementById('danger-message');
    const submitBtn = document.getElementById('danger-submit-btn');
    const cancelBtn = document.getElementById('danger-cancel-btn');

    msg.textContent = message;
    modal.classList.add('open');
    submitBtn.focus();

    const cleanup = () => {
      submitBtn.onclick = null;
      cancelBtn.onclick = null;
      modal.classList.remove('open');
    };

    submitBtn.onclick = () => {
      cleanup();
      resolve(true);
    };
    cancelBtn.onclick = () => { cleanup(); resolve(false); };
  });
}

// Helper custom final text verification
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function promptFinalConfirmDanger() {
  return new Promise((resolve) => {
    const modal = document.getElementById('final-danger-modal');
    const codeElem = document.getElementById('final-danger-code');
    const inputElem = document.getElementById('final-danger-input');
    const submitBtn = document.getElementById('final-danger-submit-btn');
    const cancelBtn = document.getElementById('final-danger-cancel-btn');

    const targetCode = generateRandomString(15);
    codeElem.textContent = targetCode;
    inputElem.value = '';
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    submitBtn.style.cursor = 'not-allowed';

    modal.classList.add('open');
    inputElem.focus();

    const checkInput = () => {
      if (inputElem.value.toUpperCase() === targetCode) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
      } else {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
      }
    };

    const cleanup = () => {
      submitBtn.onclick = null;
      cancelBtn.onclick = null;
      inputElem.oninput = null;
      modal.classList.remove('open');
    };

    inputElem.oninput = checkInput;

    submitBtn.onclick = () => {
      if (inputElem.value.toUpperCase() === targetCode) {
        cleanup();
        resolve(true);
      }
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

document.getElementById('sync-btn').addEventListener('click', () => syncData(filterTanggal.value));

// --- Data WA Aslab Modal Endpoint & Security Helpers ---
let globalAslabData = [];
let isAslabAdmin = false;

function getAdminToken() {
  return sessionStorage.getItem('admin_token') || '';
}

function setAdminToken(token) {
  if (token) {
    sessionStorage.setItem('admin_token', token);
    isAslabAdmin = true;
  } else {
    sessionStorage.removeItem('admin_token');
    isAslabAdmin = false;
  }
}

function getAdminHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  const token = getAdminToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function requestAdminLogin() {
  const pass = await promptPassword("Masukkan password Admin untuk masuk ke Mode Admin:");
  if (pass === null) return null; // Dibatalkan
  
  const pass2 = await promptPassword("Otorisasi Lanjutan: Masukkan password Master:");
  if (pass2 === null) return null; // Dibatalkan

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass, master_password: pass2 })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success' && data.token) {
      setAdminToken(data.token);
      return data.token;
    } else {
      alert(data.detail || data.message || "Password Admin / Master salah!");
      return null;
    }
  } catch (err) {
    alert("Gagal menghubungi server untuk verifikasi otentikasi.");
    return null;
  }
}

function renderAslabTable() {
  const tbody = document.getElementById('aslab-data-tbody');
  tbody.innerHTML = '';
  
  let sortedAslab = [];
  if (globalAslabData && globalAslabData.length > 0) {
    sortedAslab = [...globalAslabData].sort((a, b) => {
      const getKampus = (item) => {
        if (item.kampus) return item.kampus.toLowerCase();
        if (item.nama_ruangan && item.nama_ruangan.toLowerCase().includes('kobar')) return 'kobar';
        return 'thehok'; // fallback
      };
      
      const kampusA = getKampus(a);
      const kampusB = getKampus(b);
      
      const ruangA = a.nama_ruangan || '';
      const ruangB = b.nama_ruangan || '';
      
      const isLabA = isLab(ruangA);
      const isLabB = isLab(ruangB);
      
      if (isLabA !== isLabB) return isLabA ? -1 : 1;
      
      if (kampusA !== kampusB) return kampusA.includes('kobar') ? -1 : 1;
      
      return ruangA.localeCompare(ruangB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  if (sortedAslab.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isAslabAdmin ? 6 : 5}" style="padding: 15px; text-align: center; color: var(--text-muted);">Tidak ada data asisten lab.</td></tr>`;
    return;
  }
  
  let html = '';
  sortedAslab.forEach((a, idx) => {
    let displayWa = a.no_wa || '-';

    if (!isAslabAdmin && displayWa.includes('@lid')) {
      return;
    }

    if (!isAslabAdmin && displayWa.length > 7) {
      displayWa = displayWa.substring(0, 5) + '****' + displayWa.substring(displayWa.length - 3);
    }
    
    const adminColStyle = isAslabAdmin ? 'table-cell' : 'none';
    let actionHtml = `
      <td style="padding: 10px; text-align: center; display: ${adminColStyle};" class="admin-only-col">
        <button class="btn" style="padding: 5px 10px; font-size: 0.85em; background: var(--bg-elevated); border: 1px solid var(--border); margin-right: 5px;" onclick="editAslab(${a.id_aslab})">Edit</button>
        <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.85em;" onclick="deleteAslab(${a.id_aslab}, '${a.nama_aslab}')">Hapus</button>
      </td>
    `;
    
    const getKampusDisplay = (item) => {
        let val = item.kampus;
        if (!val && item.nama_ruangan && item.nama_ruangan.toLowerCase().includes('kobar')) val = 'Kobar';
        if (!val && item.nama_ruangan) val = 'Thehok';
        if (!val) return '-';
        return val.replace(/kampus\s+/gi, "").trim();
    };
    
    const kampusDisplay = getKampusDisplay(a);
    const ruangDisplay = a.nama_ruangan || '-';

    html += `
            <tr style="border-bottom: 1px solid var(--border);">
              <td style="padding: 10px; text-align: center;">${idx + 1}</td>
              <td style="padding: 10px;">${escapeHtml(a.nama_aslab)}</td>
              <td style="padding: 10px; font-weight: 500;">${escapeHtml(kampusDisplay)}</td>
              <td style="padding: 10px;">${escapeHtml(ruangDisplay)}</td>
              <td style="padding: 10px;">${escapeHtml(displayWa)}</td>
              ${actionHtml}
            </tr>
          `;
  });
  tbody.innerHTML = html;
}

window.deleteAslab = async function (id_aslab, nama) {
  if (confirm(`Yakin ingin menghapus data asisten lab ${nama}?`)) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/aslab/${id_aslab}`, {
        method: 'DELETE',
        headers: getAdminHeaders()
      });
      const result = await res.json();
      if (res.ok && result.status === 'success') {
        alert(result.message);
        // Refresh data aslab dengan token admin
        const resAslab = await fetch(`${API_BASE_URL}/api/aslab?_t=${Date.now()}`, {
          headers: getAdminHeaders()
        });
        const dataAslab = await resAslab.json();
        if (dataAslab.status === 'success') {
          globalAslabData = dataAslab.data;
          renderAslabTable();
        }
      } else {
        alert("Gagal menghapus: " + (result.detail || result.message));
      }
    } catch (e) {
      alert("Terjadi kesalahan jaringan.");
    }
  }
};

function populateSortedRuanganSelect(selectElement, selectedValue = "") {
  if (!selectElement) return;
  selectElement.innerHTML = '<option value="">-- Pilih Ruangan / Labor --</option>';

  // Natural Sort agar nomor ruangan urut rapi (1.2 sebelum 1.10, dsb)
  const naturalSort = (a, b) => (a.nama_ruangan || '').localeCompare(b.nama_ruangan || '', undefined, { numeric: true, sensitivity: 'base' });

  // Pisahkan Kobar (Lab vs Kelas) & Urutkan
  const kobarLabs = allRuanganData.filter(r => r.kampus && r.kampus.includes('Kobar') && isLab(r.nama_ruangan)).sort(naturalSort);
  const kobarKelas = allRuanganData.filter(r => r.kampus && r.kampus.includes('Kobar') && !isLab(r.nama_ruangan)).sort(naturalSort);

  // Pisahkan Thehok (Lab vs Kelas) & Urutkan
  const thehokLabs = allRuanganData.filter(r => r.kampus && r.kampus.includes('Thehok') && isLab(r.nama_ruangan)).sort(naturalSort);
  const thehokKelas = allRuanganData.filter(r => r.kampus && r.kampus.includes('Thehok') && !isLab(r.nama_ruangan)).sort(naturalSort);

  if (kobarLabs.length > 0) {
    const group = document.createElement('optgroup');
    group.label = "Labor (Kobar)";
    kobarLabs.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id_ruangan;
      opt.textContent = `${r.nama_ruangan}`;
      group.appendChild(opt);
    });
    selectElement.appendChild(group);
  }

  if (thehokLabs.length > 0) {
    const group = document.createElement('optgroup');
    group.label = "Labor (Thehok)";
    thehokLabs.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id_ruangan;
      opt.textContent = `${r.nama_ruangan}`;
      group.appendChild(opt);
    });
    selectElement.appendChild(group);
  }

  if (kobarKelas.length > 0) {
    const group = document.createElement('optgroup');
    group.label = "Ruangan Kelas (Kobar)";
    kobarKelas.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id_ruangan;
      opt.textContent = `${r.nama_ruangan}`;
      group.appendChild(opt);
    });
    selectElement.appendChild(group);
  }

  if (thehokKelas.length > 0) {
    const group = document.createElement('optgroup');
    group.label = "Ruangan Kelas (Thehok)";
    thehokKelas.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id_ruangan;
      opt.textContent = `${r.nama_ruangan}`;
      group.appendChild(opt);
    });
    selectElement.appendChild(group);
  }

  if (selectedValue) {
    selectElement.value = selectedValue;
  }
}

window.editAslab = function (id_aslab) {
  const aslab = globalAslabData.find(a => a.id_aslab === id_aslab);
  if (!aslab) return;

  document.getElementById('edit-aslab-id').value = aslab.id_aslab;
  document.getElementById('edit-aslab-nama').value = aslab.nama_aslab;
  document.getElementById('edit-aslab-wa').value = aslab.no_wa;

  const select = document.getElementById('edit-aslab-ruangan');
  populateSortedRuanganSelect(select, aslab.id_ruangan);

  document.getElementById('wa-modal-data').style.display = 'none';
  document.getElementById('wa-modal-edit').style.display = 'flex';
  document.getElementById('wa-modal-title').innerText = "Edit Aslab";
  document.getElementById('wa-modal-icon').innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
};

document.getElementById('test-wa-btn').addEventListener('click', async () => {
  // Buka modal Data & Pengaturan WA Aslab
  try {
    const resAslab = await fetch(`${API_BASE_URL}/api/aslab?_t=${Date.now()}`, {
      headers: getAdminHeaders()
    });
    const dataAslab = await resAslab.json();

    if (dataAslab.status !== 'success') {
      alert("Gagal mengambil data aslab.");
      return;
    }

    globalAslabData = dataAslab.data;

    // Sinkronisasi status admin dari token
    if (getAdminToken()) {
      isAslabAdmin = true;
    } else {
      isAslabAdmin = false;
    }

    const testModal = document.getElementById('test-wa-modal');
    const menuView = document.getElementById('wa-modal-menu');
    const testView = document.getElementById('wa-modal-test');
    const dataView = document.getElementById('wa-modal-data');
    const addView = document.getElementById('wa-modal-add');
    const editView = document.getElementById('wa-modal-edit');
    const qrView = document.getElementById('wa-modal-qr');
    const modalTitle = document.getElementById('wa-modal-title');
    const modalIcon = document.getElementById('wa-modal-icon');
    const adminToggle = document.getElementById('admin-mode-toggle');
    const btnShowTest = document.getElementById('btn-show-test-wa');
    const btnShowAdd = document.getElementById('btn-show-add-wa');

    const updateAdminUI = () => {
      if (isAslabAdmin) {
        adminToggle.innerText = 'Admin: ON';
        adminToggle.style.color = '#fff';
        adminToggle.style.background = 'var(--primary)';
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
        document.querySelectorAll('.admin-only-col').forEach(el => el.style.display = 'table-cell');
      } else {
        adminToggle.innerText = 'Admin: OFF';
        adminToggle.style.color = 'var(--text-muted)';
        adminToggle.style.background = 'var(--bg-elevated)';
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.admin-only-col').forEach(el => el.style.display = 'none');
      }
      renderAslabTable();
      if (document.getElementById('wa-modal-data-ruangan') && document.getElementById('wa-modal-data-ruangan').style.display === 'flex') {
        renderRuanganTable();
      }
    };

    adminToggle.onclick = async () => {
      if (isAslabAdmin) {
        // Logout Admin
        try {
          await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: getAdminHeaders()
          });
        } catch (err) {}
        setAdminToken(null);
        // Refresh data aslab menjadi nomor yang disensor
        try {
          const res = await fetch(`${API_BASE_URL}/api/aslab?_t=${Date.now()}`);
          const json = await res.json();
          if (json.status === 'success') globalAslabData = json.data;
        } catch (err) {}
        updateAdminUI();
      } else {
        testModal.classList.remove('open');
        const token = await requestAdminLogin();
        if (token) {
          // Refresh data aslab untuk mendapatkan nomor telepon lengkap tanpa sensor
          try {
            const res = await fetch(`${API_BASE_URL}/api/aslab?_t=${Date.now()}`, {
              headers: getAdminHeaders()
            });
            const json = await res.json();
            if (json.status === 'success') globalAslabData = json.data;
          } catch (err) {}
          updateAdminUI();
        }
        testModal.classList.add('open');
      }
    };

    const SVG_WA_ICONS = {
      aslab: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
      qr: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><path d="M7 17h.01M17 17h.01M7 7h.01M17 7h.01"></path></svg>`,
      chat: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
      list: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
      add: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
      edit: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`
    };

    const showMenu = () => {
      menuView.style.display = 'flex';
      testView.style.display = 'none';
      dataView.style.display = 'none';
      addView.style.display = 'none';
      editView.style.display = 'none';
      if (qrView) qrView.style.display = 'none';
      if (document.getElementById('wa-modal-data-ruangan')) document.getElementById('wa-modal-data-ruangan').style.display = 'none';
      if (document.getElementById('wa-modal-add-ruangan')) document.getElementById('wa-modal-add-ruangan').style.display = 'none';
      modalTitle.innerText = "Setting";
      modalIcon.innerHTML = SVG_WA_ICONS.aslab;
      adminToggle.style.display = 'block';
      updateAdminUI();
    };

    showMenu();
    testModal.classList.add('open');

    // Tutup modal
    document.getElementById('wa-modal-close-btn').onclick = () => {
      isAslabAdmin = false;
      updateAdminUI();
      testModal.classList.remove('open');
    };

    // Navigasi ke QR Code Akses HP
    const btnShowQr = document.getElementById('btn-show-qr-access');
    if (btnShowQr) {
      btnShowQr.onclick = async () => {
        menuView.style.display = 'none';
        if (qrView) qrView.style.display = 'flex';
        adminToggle.style.display = 'none';
        modalTitle.innerText = "Akses Dashboard HP";
        modalIcon.innerHTML = SVG_WA_ICONS.qr;

        // Helper render QR
        const renderQrForUrl = (targetUrl) => {
          const qrInput = document.getElementById('qr-link-input');
          const qrOpen = document.getElementById('qr-open-link');
          const qrDisplay = document.getElementById('qrcode-display');
          const qrFallbackImg = document.getElementById('qrcode-img-fallback');

          qrInput.value = targetUrl;
          qrOpen.href = targetUrl;

          qrDisplay.innerHTML = '';
          qrFallbackImg.style.display = 'none';

          if (typeof QRCode !== 'undefined') {
            try {
              new QRCode(qrDisplay, {
                text: targetUrl,
                width: 190,
                height: 190,
                colorDark: "#1e1b4b",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
              });
              qrDisplay.style.display = 'block';
            } catch (e) {
              console.error("QRCode.js error, using fallback image:", e);
              qrDisplay.style.display = 'none';
              qrFallbackImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}`;
              qrFallbackImg.style.display = 'block';
            }
          } else {
            qrDisplay.style.display = 'none';
            qrFallbackImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}`;
            qrFallbackImg.style.display = 'block';
          }
        };

        // Function to load and render server URLs with Refresh support
        const loadAndRenderServerUrls = async (isRefresh = false) => {
          const refreshIcon = document.getElementById('qr-refresh-icon');
          const refreshText = document.getElementById('qr-refresh-text');
          const statusText = document.getElementById('qr-status-text');
          const statusDot = document.getElementById('qr-status-dot');

          if (isRefresh) {
            if (refreshIcon) refreshIcon.style.animation = 'spin 0.8s linear infinite';
            if (refreshText) refreshText.innerText = 'Memperbarui...';
            if (statusText) statusText.innerText = 'Mencari link tunnel terbaru...';
          }

          let detectedUrls = [];
          try {
            const res = await fetch(`${API_BASE_URL}/api/server-urls?refresh=1&_t=${Date.now()}`);
            if (res.ok) {
              const json = await res.json();
              if (json.status === 'success' && json.urls && json.urls.length > 0) {
                detectedUrls = json.urls;
              }
            }
          } catch (err) {
            console.warn("Gagal menarik server-urls dari API, gunakan fallback:", err);
          }

          // Fallback jika API kosong
          const origin = window.location.origin;
          if (detectedUrls.length === 0) {
            if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
              detectedUrls.push({ label: "URL Web Ini (Aktif)", url: origin, primary: true });
            } else {
              detectedUrls.push({ label: "Localhost (Laptop Server)", url: "http://localhost:8000", primary: false });
            }
          }

          // Urutkan & prioritaskan: Cloudflare Tunnel > Ngrok > Wi-Fi LAN > Origin Non-Localhost > Localhost
          let defaultIndex = 0;
          let foundPriority = false;

          const urlSelect = document.getElementById('qr-url-select');
          urlSelect.innerHTML = '';
          detectedUrls.forEach((item, idx) => {
            const opt = document.createElement('option');
            opt.value = item.url;
            opt.textContent = `${item.label} ➔ ${item.url}`;
            urlSelect.appendChild(opt);

            const lowerLabel = item.label.toLowerCase();
            const lowerUrl = item.url.toLowerCase();

            if (!foundPriority && (lowerLabel.includes('cloudflare') || lowerUrl.includes('trycloudflare.com'))) {
              defaultIndex = idx;
              foundPriority = true;
            } else if (!foundPriority && (lowerLabel.includes('ngrok') || lowerUrl.includes('ngrok'))) {
              defaultIndex = idx;
            } else if (!foundPriority && defaultIndex === 0 && lowerLabel.includes('wi-fi')) {
              defaultIndex = idx;
            }
          });

          if (urlSelect.options[defaultIndex]) {
            urlSelect.options[defaultIndex].selected = true;
          }

          renderQrForUrl(urlSelect.value);

          if (isRefresh) {
            setTimeout(() => {
              if (refreshIcon) refreshIcon.style.animation = 'none';
              if (refreshText) refreshText.innerText = 'Refresh Link';
              if (statusText) statusText.innerText = 'Link & QR Berhasil Diperbarui!';
              if (statusDot) statusDot.style.background = '#10b981';
            }, 500);
          } else {
            if (statusText) statusText.innerText = 'Link Real-Time Aktif';
            if (statusDot) statusDot.style.background = '#10b981';
          }
        };

        const refreshBtn = document.getElementById('qr-refresh-btn');
        if (refreshBtn) {
          refreshBtn.onclick = () => loadAndRenderServerUrls(true);
        }

        const urlSelect = document.getElementById('qr-url-select');
        urlSelect.onchange = () => {
          renderQrForUrl(urlSelect.value);
        };

        // Initial load
        loadAndRenderServerUrls(false);

        // Copy button
        const copyBtn = document.getElementById('qr-copy-btn');
        const copyText = document.getElementById('qr-copy-btn-text');
        copyBtn.onclick = async () => {
          const val = document.getElementById('qr-link-input').value;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(val);
            } else {
              const input = document.getElementById('qr-link-input');
              input.select();
              document.execCommand('copy');
            }
            copyText.textContent = "Tersalin!";
            setTimeout(() => {
              copyText.textContent = "Salin";
            }, 2000);
          } catch (err) {
            alert("Link: " + val);
          }
        };

        // Back button
        document.getElementById('qr-back-btn').onclick = showMenu;
      };
    }

    // Navigasi ke Uji Coba WA
    document.getElementById('btn-show-test-wa').onclick = () => {
      menuView.style.display = 'none';
      testView.style.display = 'flex';
      adminToggle.style.display = 'none';
      modalTitle.innerText = "Uji Coba Pesan WA";
      modalIcon.innerHTML = SVG_WA_ICONS.chat;

      const listContainer = document.getElementById('aslab-list-container');
      document.getElementById('aslab-select').value = "";

      let listHtml = `<div class="aslab-list-item active" onclick="selectAslabItem(this, '')">-- Semua Aslab --</div>`;
      globalAslabData.forEach(a => {
        listHtml += `<div class="aslab-list-item" onclick="selectAslabItem(this, '${a.id_aslab}')">${a.nama_ruangan} - ${a.nama_aslab}</div>`;
      });
      listContainer.innerHTML = listHtml;
    };

    // Navigasi ke Data WA
    document.getElementById('btn-show-data-wa').onclick = async () => {
      menuView.style.display = 'none';
      addView.style.display = 'none';
      if (document.getElementById('wa-modal-data-ruangan')) document.getElementById('wa-modal-data-ruangan').style.display = 'none';
      if (document.getElementById('wa-modal-add-ruangan')) document.getElementById('wa-modal-add-ruangan').style.display = 'none';
      dataView.style.display = 'flex';
      modalTitle.innerText = "Daftar Nomor WA";
      modalIcon.innerHTML = SVG_WA_ICONS.list;
      // Fetch latest Aslab data to ensure foreign key safety
      try {
        const resAslab = await fetch(`${API_BASE_URL}/api/aslab?_t=${Date.now()}`);
        const dataAslab = await resAslab.json();
        if (dataAslab.status === 'success') {
          globalAslabData = dataAslab.data;
        }
      } catch (err) {
        console.error("Gagal menarik data aslab:", err);
      }
      renderAslabTable();
    };

    
    const dataRuanganView = document.getElementById('wa-modal-data-ruangan');
    const addRuanganView = document.getElementById('wa-modal-add-ruangan');
    
    // Render Ruangan Table
    const renderRuanganTable = () => {
      const tbody = document.getElementById('ruangan-data-tbody');
      
      let sortedRuangan = [];
      if (allRuanganData && allRuanganData.length > 0) {
        sortedRuangan = [...allRuanganData].sort((a, b) => {
          const isLabA = isLab(a.nama_ruangan);
          const isLabB = isLab(b.nama_ruangan);
          
          if (isLabA !== isLabB) return isLabA ? -1 : 1;
          
          const kampusA = a.kampus ? a.kampus.toLowerCase() : (a.nama_ruangan.toLowerCase().includes('kobar') ? 'kobar' : 'thehok');
          const kampusB = b.kampus ? b.kampus.toLowerCase() : (b.nama_ruangan.toLowerCase().includes('kobar') ? 'kobar' : 'thehok');
          
          if (kampusA !== kampusB) return kampusA.includes('kobar') ? -1 : 1;
          
          return a.nama_ruangan.localeCompare(b.nama_ruangan, undefined, { numeric: true, sensitivity: 'base' });
        });
      }

      if (sortedRuangan.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAslabAdmin ? 4 : 3}" style="text-align:center; padding:15px;">Belum ada data Ruangan.</td></tr>`;
        return;
      }
      
      let html = '';
      sortedRuangan.forEach((r, idx) => {
        const adminColStyle = isAslabAdmin ? 'table-cell' : 'none';
        const rawKampus = r.kampus ? r.kampus : (r.nama_ruangan.toLowerCase().includes('kobar') ? 'Kobar' : 'Thehok');
        const kampusDisplay = rawKampus.replace(/kampus\s+/gi, "").trim();
        html += `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 10px; text-align: center;">${idx + 1}</td>
            <td style="padding: 10px; font-weight: 500;">${escapeHtml(kampusDisplay)}</td>
            <td style="padding: 10px; font-weight: 500;">${escapeHtml(r.nama_ruangan)}</td>
            <td style="padding: 10px; text-align: center; display: ${adminColStyle};" class="admin-only-col">
              <button class="btn-delete-ruangan" data-id="${r.id_ruangan}" data-nama="${escapeHtml(r.nama_ruangan)}" style="background:var(--badge-cc); color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:0.85em;">Hapus</button>
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
      
      // Bind Delete Ruangan
      document.querySelectorAll('.btn-delete-ruangan').forEach(btn => {
        btn.onclick = async (e) => {
          const id = e.target.getAttribute('data-id');
          const nama = e.target.getAttribute('data-nama');
          if (confirm(`Yakin ingin menghapus Ruangan "${nama}"? (Tidak bisa dihapus jika sedang dipakai Aslab)`)) {
            try {
              const res = await fetch(`${API_BASE_URL}/api/ruangan/${id}`, {
                method: 'DELETE',
                headers: getAdminHeaders()
              });
              const data = await res.json();
              if (res.ok && data.status === 'success') {
                alert(data.message);
                document.getElementById('btn-show-data-ruangan').click(); // Refresh
              } else {
                alert("Gagal: " + (data.detail || data.message));
              }
            } catch (err) {
              alert("Terjadi kesalahan jaringan.");
            }
          }
        };
      });
    };

    // Navigasi ke Data Ruangan
    const btnShowDataRuangan = document.getElementById('btn-show-data-ruangan');
    if (btnShowDataRuangan) {
      btnShowDataRuangan.onclick = async () => {
        menuView.style.display = 'none';
        dataView.style.display = 'none'; // Fix overlap
        addView.style.display = 'none';
        dataRuanganView.style.display = 'flex';
        modalTitle.innerText = "Daftar Ruangan";
        
        try {
          const resRuangan = await fetch(`${API_BASE_URL}/api/ruangan?_t=${Date.now()}`);
          const dataRuangan = await resRuangan.json();
          if (dataRuangan.status === 'success') {
            allRuanganData = dataRuangan.data;
          }
        } catch (err) { console.error(err); }
        
        renderRuanganTable();
      };
    }

    // Navigasi ke Tambah Ruangan
    const btnShowAddRuangan = document.getElementById('btn-show-add-ruangan');
    if (btnShowAddRuangan) {
      btnShowAddRuangan.onclick = () => {
        menuView.style.display = 'none';
        dataView.style.display = 'none';
        addView.style.display = 'none';
        dataRuanganView.style.display = 'none';
        addRuanganView.style.display = 'flex';
        modalTitle.innerText = "Tambah Ruangan";
      };
    }

    // Kembali dari Ruangan
    document.getElementById('data-ruangan-back-btn')?.addEventListener('click', showMenu);
    document.getElementById('add-ruangan-back-btn')?.addEventListener('click', showMenu);

    // Submit Tambah Ruangan
    const btnAddRuanganSubmit = document.getElementById('add-ruangan-submit-btn');
    if (btnAddRuanganSubmit) {
      btnAddRuanganSubmit.onclick = async () => {
        const nama = document.getElementById('add-ruangan-nama').value;
        const kampus = document.getElementById('add-ruangan-kampus').value;
        if (!nama) {
          alert("Harap isi nama ruangan!");
          return;
        }
        
        const originalHtml = btnAddRuanganSubmit.innerHTML;
        btnAddRuanganSubmit.disabled = true;
        btnAddRuanganSubmit.innerHTML = 'Menyimpan...';
        
        try {
          const res = await fetch(`${API_BASE_URL}/api/ruangan/add`, {
            method: 'POST',
            headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ kampus: kampus, nama_ruangan: nama })
          });
          const data = await res.json();
          if (res.ok && data.status === 'success') {
            alert(data.message);
            document.getElementById('add-ruangan-nama').value = '';
            document.getElementById('btn-show-data-ruangan').click();
          } else {
            alert("Gagal menambahkan ruangan: " + (data.detail || data.message));
          }
        } catch (e) {
          alert("Terjadi kesalahan jaringan.");
        }
        
        btnAddRuanganSubmit.disabled = false;
        btnAddRuanganSubmit.innerHTML = originalHtml;
      };
    }

    // Navigasi ke Tambah Data WA
    document.getElementById('btn-show-add-wa').onclick = async () => {
      menuView.style.display = 'none';
      dataView.style.display = 'none';
      if (document.getElementById('wa-modal-data-ruangan')) document.getElementById('wa-modal-data-ruangan').style.display = 'none';
      if (document.getElementById('wa-modal-add-ruangan')) document.getElementById('wa-modal-add-ruangan').style.display = 'none';
      addView.style.display = 'flex';
      modalTitle.innerText = "Tambah Aslab";
      modalIcon.innerHTML = SVG_WA_ICONS.add;

      // Fetch latest Ruangan data
      try {
        const resRuangan = await fetch(`${API_BASE_URL}/api/ruangan?_t=${Date.now()}`);
        const dataRuangan = await resRuangan.json();
        if (dataRuangan.status === 'success') {
          allRuanganData = dataRuangan.data;
        }
      } catch (err) {}

      const selectRuangan = document.getElementById('add-aslab-ruangan');
      populateSortedRuanganSelect(selectRuangan, "");
    };

    // Tombol kembali
    document.getElementById('test-wa-back-btn').onclick = showMenu;
    document.getElementById('data-wa-back-btn').onclick = showMenu;
    document.getElementById('add-wa-back-btn').onclick = showMenu;
    document.getElementById('edit-wa-back-btn').onclick = showMenu;

    // Submit Edit Data WA
    document.getElementById('edit-wa-submit-btn').onclick = async () => {
      const id = document.getElementById('edit-aslab-id').value;
      const nama = document.getElementById('edit-aslab-nama').value;
      const noWa = document.getElementById('edit-aslab-wa').value;
      const idRuangan = document.getElementById('edit-aslab-ruangan').value;

      if (!id || !nama || !noWa || !idRuangan) {
        alert("Harap isi semua data (Nama, No WA, dan Ruangan)!");
        return;
      }

      const btn = document.getElementById('edit-wa-submit-btn');
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Menyimpan...';

      try {
        const res = await fetch(`${API_BASE_URL}/api/aslab/${id}`, {
          method: 'PUT',
          headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ nama_aslab: nama, no_wa: noWa, id_ruangan: parseInt(idRuangan) })
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          alert(data.message);
          // Update local data
          const index = globalAslabData.findIndex(a => a.id_aslab == id);
          if (index !== -1) {
            globalAslabData[index].nama_aslab = nama;
            globalAslabData[index].no_wa = noWa;
            globalAslabData[index].id_ruangan = parseInt(idRuangan);
            const select = document.getElementById('edit-aslab-ruangan');
            const ruanganText = select.options[select.selectedIndex].text.replace(/ \(.*\)/, ''); // Remove (Kobar) / (Thehok) for display
            globalAslabData[index].nama_ruangan = ruanganText;
          }
          // Return to data view to see changes
          document.getElementById('btn-show-data-wa').click();
        } else {
          alert("Gagal mengubah data: " + (data.detail || data.message));
        }
      } catch (e) {
        alert("Terjadi kesalahan jaringan.");
      }
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    };

    // Submit Tambah Data WA
    document.getElementById('add-wa-submit-btn').onclick = async () => {
      const nama = document.getElementById('add-aslab-nama').value;
      const noWa = document.getElementById('add-aslab-wa').value;
      const idRuangan = document.getElementById('add-aslab-ruangan').value;

      if (!nama || !noWa || !idRuangan) {
        alert("Harap isi semua data (Nama, No WA, dan Ruangan)!");
        return;
      }

      const btn = document.getElementById('add-wa-submit-btn');
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Menyimpan...';

      try {
        const res = await fetch(`${API_BASE_URL}/api/aslab/add`, {
          method: 'POST',
          headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ nama_aslab: nama, no_wa: noWa, id_ruangan: parseInt(idRuangan) })
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          alert(data.message);
          // Clear inputs
          document.getElementById('add-aslab-nama').value = '';
          document.getElementById('add-aslab-wa').value = '';
          document.getElementById('add-aslab-ruangan').value = '';
          // Return to data view to see changes
          document.getElementById('btn-show-data-wa').click();
        } else {
          alert("Gagal menambahkan data: " + (data.detail || data.message));
        }
      } catch (e) {
        alert("Terjadi kesalahan jaringan.");
      }
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    };

    // Submit Uji Coba WA
    document.getElementById('test-wa-submit-btn').onclick = async () => {
      const select = document.getElementById('aslab-select');
      const selectedId = select.value;
      const actionType = document.getElementById('test-action-select').value;

      const btn = document.getElementById('test-wa-submit-btn');
      const originalHtml = btn.innerHTML;

      btn.disabled = true;
      btn.innerHTML = `Mengirim...`;

      try {
        const payload = {};
        if (selectedId) payload.id_aslab = parseInt(selectedId);
        payload.action_type = actionType;

        const response = await fetch(`${API_BASE_URL}/api/test-wa`, {
          method: 'POST',
          headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (response.ok && result.status === 'success') {
          let report = result.message + "\\n\\nDetail:\\n";
          result.data.forEach(d => report += `- ${d.ruangan} (${d.nama}): ${d.success ? 'TERKIRIM' : 'GAGAL'}\\n`);
          alert(report);
        } else {
          alert("Gagal kirim test WA: " + (result.detail || result.message));
        }
      } catch (e) {
        alert("Terjadi kesalahan koneksi saat kirim WA.");
      }
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    };
  } catch (e) {
    alert("Gagal memuat daftar aslab.");
  }
});

// Toggle Info Mase Inline Panel
document.getElementById('toggle-notif-btn').addEventListener('click', () => {
  const panel = document.getElementById('info-mase-panel');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
});

// Handle Modal Detail Ruangan
window.showRoomDetail = function (roomName, kampusStr) {
  const filterTanggal = document.getElementById('filter-tanggal');
  const today = new Date();
  const currentDayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const activeDate = (filterTanggal && filterTanggal.value) ? filterTanggal.value : currentDayStr;

  const schedules = allJadwal.filter(item => {
    if (!item.nama_ruangan || !item.tanggal || !item.jam) return false;
    if (item.tanggal !== activeDate) return false;

    if (item.nama_ruangan.split(" (Kampus")[0] !== roomName) return false;

    if (kampusStr) {
      if (kampusStr === 'Thehok' && item.nama_ruangan.includes('Kampus Kobar')) return false;
      if (kampusStr === 'Kobar' && item.nama_ruangan.includes('Kampus Thehok')) return false;
    }
    return true;
  });

  schedules.sort((a, b) => {
    const aParts = a.jam.split(':');
    const bParts = b.jam.split(':');
    return (parseInt(aParts[0], 10) * 60 + parseInt(aParts[1], 10)) - (parseInt(bParts[0], 10) * 60 + parseInt(bParts[1], 10));
  });

  document.getElementById('room-detail-title').innerText = `${roomName} (${kampusStr || ''})`;
  const listContainer = document.getElementById('room-detail-list');

  if (schedules.length === 0) {
    listContainer.innerHTML = '<li><em>Tidak ada jadwal tercatat hari ini.</em></li>';
  } else {
    listContainer.innerHTML = schedules.map(s => {
      let methodBadge = '';
      if (s.metode_pembelajaran) {
        methodBadge = `<span style="font-size: 0.75em; padding: 2px 6px; border-radius: 4px; background: rgba(99, 102, 241, 0.15); color: var(--primary); margin-left: 8px; font-weight: bold;">${s.metode_pembelajaran}</span>`;
      }

      let statusBadge = '';
      if (s.status_jadwal && s.status_jadwal.trim() !== '' && s.status_jadwal.trim() !== '-') {
        let sText = s.status_jadwal.toUpperCase();
        let bg = 'rgba(107, 114, 128, 0.15)';
        let c = '#9ca3af';

        if (sText.includes('TAMBAHAN')) { bg = 'rgba(34, 197, 94, 0.15)'; c = '#4ade80'; }
        else if (sText.includes('PERUBAHAN')) { bg = 'rgba(239, 68, 68, 0.15)'; c = '#f87171'; }
        else if (sText.includes('JEDA')) { bg = 'rgba(245, 158, 11, 0.15)'; c = '#fbbf24'; }

        statusBadge = `<div style="font-size: 0.65em; padding: 4px 8px; border-radius: 6px; background: ${bg}; color: ${c}; font-weight: bold; border: 1px solid ${c}40; text-align: center; display: flex; align-items: center; justify-content: center; max-width: 90px; line-height: 1.2;">${sText}</div>`;
      }

      return `
            <li style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); box-shadow: var(--shadow-xs);">
              <div>
                <div style="font-weight: bold; font-size: 1.05em; color: var(--text-dark); margin-bottom: 4px;">${escapeHtml(s.jam)} - Selesai ${methodBadge}</div>
                <div style="color: var(--text);">${escapeHtml(s.nama_mk)}</div>
                <div style="font-size: 0.85em; color: var(--text-muted); margin-top: 4px;">Kelas ${escapeHtml(s.kelas)} • ${escapeHtml(s.nama_dosen)}</div>
              </div>
              ${statusBadge}
            </li>
          `;
    }).join('');
  }

  document.getElementById('room-detail-modal').classList.add('open');
};

const roomModal = document.getElementById('room-detail-modal');
document.getElementById('room-detail-close-btn').addEventListener('click', () => roomModal.classList.remove('open'));
roomModal.addEventListener('click', (e) => { if (e.target === roomModal) roomModal.classList.remove('open'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && roomModal.classList.contains('open')) roomModal.classList.remove('open'); });

document.getElementById('btn-test-notif-lab')?.addEventListener('click', () => {
  // Tutup modal Data WA Aslab
  const testModal = document.getElementById('test-wa-modal');
  if (testModal) testModal.classList.remove('open');

  // Siapkan modal pesan notifikasi ruangan
  const labModalBody = document.getElementById('lab-modal-body');
  const modalTitle = document.getElementById('lab-modal-title');
  if (modalTitle) modalTitle.textContent = 'Simulasi Pemberitahuan Ruangan';

  if (labModalBody) {
    labModalBody.innerHTML = `
          <div style="text-align: left;">
            <div style="background: rgba(99, 102, 241, 0.1); border-left: 4px solid var(--primary); padding: 8px 12px; border-radius: 4px; font-size: 0.85em; color: var(--primary); margin-bottom: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
              <span>UJI COBA / SIMULASI NOTIFIKASI RUANGAN</span>
            </div>
            <p style="margin-bottom: 6px; font-weight: 600; color: var(--primary);">Laboratorium segera mulai:</p>
            <ul style="padding-left: 18px; margin: 0 0 10px 0; display: flex; flex-direction: column; gap: 6px;">
              <li><b>Labor 1.4 (Thehok)</b> <span class="notif-cat-badge labor">Labor</span> buat matkul <b>Pemrograman Web II (03PS4)</b> (Mulai 08:00) - <i style="color:var(--badge-cc);">Buka dalam 15 menit!</i></li>
            </ul>
            <p style="margin-bottom: 6px; font-weight: 600; color: #10b981;">Ruang Kelas segera mulai:</p>
            <ul style="padding-left: 18px; margin: 0; display: flex; flex-direction: column; gap: 6px;">
              <li><b>R. 2.18 (Kobar)</b> <span class="notif-cat-badge kelas">Kelas</span> buat matkul <b>Perencanaan Bisnis (03PM6)</b> (Mulai 08:00) - <i style="color:var(--badge-jeda);">Buka dalam 30 menit!</i></li>
            </ul>
          </div>
        `;
  }
  openModal(false);
});

document.getElementById('btn-test-notif-suara').addEventListener('click', () => {
  playNotificationSound();
});

document.getElementById('clear-db-btn').addEventListener('click', async () => {
  // Pastikan user terotentikasi sebagai Admin di level Backend
  let token = getAdminToken();
  if (!token) {
    token = await requestAdminLogin();
    if (!token) return; // Login dibatalkan atau gagal
  }

  const isSure = await promptConfirmDanger("Yakin ingin menghapus SELURUH data jadwal dari database?");
  if (isSure) {
    const isFinalSure = await promptFinalConfirmDanger();
    if (!isFinalSure) return;

    const btn = document.getElementById('clear-db-btn');
    btn.disabled = true;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> Menghapus...`;
    try {
      const response = await fetch(`${API_BASE_URL}/api/jadwal`, {
        method: 'DELETE',
        headers: getAdminHeaders()
      });
      const result = await response.json();
      if (response.ok && result.status === 'success') {
        showCustomAlert("Berhasil Dihapus!", result.message, "success");
        await fetchAllJadwal();
      }
      else {
        showCustomAlert("Gagal!", "Gagal menghapus database: " + (result.detail || result.message), "error");
      }
    } catch (e) {
      showCustomAlert("Error", "Terjadi kesalahan saat menghapus database.", "warning");
    }
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Bersihkan Semua Jadwal DB`;
  }
});

filterTanggal.addEventListener('change', () => {
  updateRuanganFilterOptions();
  applyFilters();
  if (filterTanggal.value) {
    fetchNotifikasiLab(filterTanggal.value, false);
    syncData(filterTanggal.value);
  }
});

// 6. Auto-Sync setiap 10 menit
setInterval(() => {
  const currentDate = filterTanggal.value;
  if (currentDate) {
    // Menjalankan Auto-Sync untuk tanggal: currentDate
    syncData(currentDate);
  }
}, 10 * 60 * 1000); // 10 menit dalam milidetik

// ─── Modal Logic ───
const modal = document.getElementById('lab-modal');
const modalBody = document.getElementById('lab-modal-body');
const modalCloseBtn = document.getElementById('modal-close-btn');
let alarmInterval = null;
let autoCloseTimeout = null;

function openModal(isRepeat = false) {
  modal.classList.add('open');
  playNotificationSound();

  // Ulangi alarm setiap 3 menit jika belum ditutup dan isRepeat = true
  if (isRepeat && !alarmInterval) {
    alarmInterval = setInterval(playNotificationSound, 3 * 60 * 1000);
  }

  // Auto close setelah 30 detik
  if (autoCloseTimeout) {
    clearTimeout(autoCloseTimeout);
  }
  autoCloseTimeout = setTimeout(() => {
    closeModal();
  }, 30000);

  modalCloseBtn.focus();
}

function closeModal() {
  modal.classList.remove('open');
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (autoCloseTimeout) {
    clearTimeout(autoCloseTimeout);
    autoCloseTimeout = null;
  }
}

modalCloseBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

// ─── Notification Sound ───
function playNotificationSound() {
  try { const audio = new Audio('notif.mp3'); audio.play().catch(() => playDefaultTone()); }
  catch (e) { playDefaultTone(); }
}

function playDefaultTone() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playTone(freq, startTime, duration) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startTime);
      gain.gain.setValueAtTime(0, audioCtx.currentTime + startTime);
      gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + startTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + startTime);
      osc.stop(audioCtx.currentTime + startTime + duration);
    }
    playTone(880, 0, 0.3);
    playTone(1108.73, 0.15, 0.5);
  } catch (e) { /* Browser memblokir autoplay suara */ }
}

// ─── Room & Lab Check (Notifikasi Mulai Ruangan/Labor) ───
const notifiedLabAlarmKeys = new Set();

function checkLabNotifications() {
  const now = new Date();
  const currentTotalMin = now.getHours() * 60 + now.getMinutes();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const currentDayStr = `${year}-${month}-${day}`;

  let firstClasses = {};
  allJadwal.forEach(item => {
    if (item.tanggal === currentDayStr && item.metode_pembelajaran !== 'CC' && item.metode_pembelajaran !== 'OL' && item.jam && item.nama_ruangan) {
      const parts = item.jam.split(':');
      const startTotalMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);

      // Hanya cek kelas yang belum lewat waktu mulainya
      if (startTotalMin >= currentTotalMin) {
        if (!firstClasses[item.nama_ruangan] || startTotalMin < firstClasses[item.nama_ruangan].startTotalMin) {
          firstClasses[item.nama_ruangan] = {
            nama_mk: item.nama_mk,
            jam: item.jam,
            startTotalMin,
            isLab: isLab(item.nama_ruangan)
          };
        }
      }
    }
  });

  let labToNotify = [];
  let kelasToNotify = [];
  for (const [ruang, dataClass] of Object.entries(firstClasses)) {
    const diffMin = dataClass.startTotalMin - currentTotalMin;
    if (diffMin === 30 || diffMin === 15) {
      const alarmKey = `${currentDayStr}_${ruang}_${dataClass.jam}_${diffMin}`;
      if (!notifiedLabAlarmKeys.has(alarmKey)) {
        notifiedLabAlarmKeys.add(alarmKey);
        const badgeHTML = dataClass.isLab ? '<span class="notif-cat-badge labor">Labor</span>' : '<span class="notif-cat-badge kelas">Kelas</span>';
        const itemMsg = `<b>${ruang}</b> ${badgeHTML} untuk matkul <b>${dataClass.nama_mk}</b> (Mulai ${dataClass.jam}) - <i style="color:var(--primary);">Buka dalam ${diffMin} menit!</i>`;
        if (dataClass.isLab) {
          labToNotify.push(itemMsg);
        } else {
          kelasToNotify.push(itemMsg);
        }
      }
    }
  }

  if (labToNotify.length > 0 || kelasToNotify.length > 0) {
    let contentHTML = '';
    const modalTitle = document.getElementById('lab-modal-title');

    if (labToNotify.length > 0 && kelasToNotify.length === 0) {
      if (modalTitle) modalTitle.textContent = 'Pemberitahuan Laboratorium';
      contentHTML += '<p style="font-weight:600; margin-bottom:8px;">Buka labor sekarang, praktikum segera mulai:</p><ul style="padding-left:18px; margin:0 0 10px 0; display:flex; flex-direction:column; gap:6px;">' + labToNotify.map(l => `<li>${l}</li>`).join('') + '</ul>';
    } else if (kelasToNotify.length > 0 && labToNotify.length === 0) {
      if (modalTitle) modalTitle.textContent = 'Pemberitahuan Ruang Kelas';
      contentHTML += '<p style="font-weight:600; margin-bottom:8px;">Persiapkan ruang kelas, perkuliahan segera mulai:</p><ul style="padding-left:18px; margin:0 0 10px 0; display:flex; flex-direction:column; gap:6px;">' + kelasToNotify.map(k => `<li>${k}</li>`).join('') + '</ul>';
    } else {
      if (modalTitle) modalTitle.textContent = 'Pemberitahuan Ruangan & Labor';
      if (labToNotify.length > 0) {
        contentHTML += '<p style="font-weight:600; margin-bottom:6px; color:var(--primary);">Laboratorium segera mulai:</p><ul style="padding-left:18px; margin:0 0 10px 0; display:flex; flex-direction:column; gap:6px;">' + labToNotify.map(l => `<li>${l}</li>`).join('') + '</ul>';
      }
      if (kelasToNotify.length > 0) {
        contentHTML += '<p style="font-weight:600; margin-bottom:6px; color:#10b981;">Ruang Kelas segera mulai:</p><ul style="padding-left:18px; margin:0 0 10px 0; display:flex; flex-direction:column; gap:6px;">' + kelasToNotify.map(k => `<li>${k}</li>`).join('') + '</ul>';
      }
    }

    modalBody.innerHTML = contentHTML;
    openModal(true); // Ulangi alarm untuk notifikasi asli
  }
}

setInterval(checkLabNotifications, 60000);
setTimeout(checkLabNotifications, 1000);

// ─── Theme Toggle ───
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = themeToggle.querySelector('.sun-icon');
const moonIcon = themeToggle.querySelector('.moon-icon');

const currentTheme = localStorage.getItem('theme') || 'light';
if (currentTheme === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
  moonIcon.style.display = 'none';
  sunIcon.style.display = '';
}

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
    moonIcon.style.display = '';
    sunIcon.style.display = 'none';
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    moonIcon.style.display = 'none';
    sunIcon.style.display = '';
  }
});

// ─── Spin animation ───
const style = document.createElement('style');
style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ─── Fitur Tambahan (Modal & Logic) ───
const btnFiturTambahan = document.getElementById('btn-fitur-tambahan');
const modalFitur = document.getElementById('modal-fitur');
const closeFitur = document.getElementById('close-modal-fitur');

const btnJenisLab = document.getElementById('btn-filter-jenis-lab');
const btnJenisKelas = document.getElementById('btn-filter-jenis-kelas');
const inputJenisRuangan = document.getElementById('filter-jenis-ruangan');

btnJenisLab.addEventListener('click', () => {
  btnJenisLab.style.background = 'var(--primary)';
  btnJenisLab.style.color = 'white';
  btnJenisLab.style.boxShadow = 'var(--shadow-sm)';
  btnJenisKelas.style.background = 'transparent';
  btnJenisKelas.style.color = 'var(--text-muted)';
  btnJenisKelas.style.boxShadow = 'none';
  inputJenisRuangan.value = 'Lab';
});

btnJenisKelas.addEventListener('click', () => {
  btnJenisKelas.style.background = 'var(--primary)';
  btnJenisKelas.style.color = 'white';
  btnJenisKelas.style.boxShadow = 'var(--shadow-sm)';
  btnJenisLab.style.background = 'transparent';
  btnJenisLab.style.color = 'var(--text-muted)';
  btnJenisLab.style.boxShadow = 'none';
  inputJenisRuangan.value = 'Kelas';
});
const tabLabKosong = document.getElementById('tab-lab-kosong');
const tabCariDosen = document.getElementById('tab-cari-dosen');
const tabCariKelas = document.getElementById('tab-cari-kelas');
const contentLabKosong = document.getElementById('content-lab-kosong');
const contentCariDosen = document.getElementById('content-cari-dosen');
const contentCariKelas = document.getElementById('content-cari-kelas');
const btnSubmitLabKosong = document.getElementById('btn-submit-lab-kosong');
const btnSubmitCariDosen = document.getElementById('btn-submit-cari-dosen');
const btnSubmitCariKelas = document.getElementById('btn-submit-cari-kelas');

// Set default date to today
const fiturTanggal = document.getElementById('fitur-tanggal');
fiturTanggal.value = new Date().toISOString().split('T')[0];
fiturTanggal.addEventListener('change', () => {
  if (fiturTanggal.value) {
    syncData(fiturTanggal.value);
  }
});

btnFiturTambahan.addEventListener('click', () => {
  modalFitur.style.display = 'block';
});

closeFitur.addEventListener('click', () => {
  modalFitur.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === modalFitur) {
    modalFitur.style.display = 'none';
  }
});

// Hover effects for close button
closeFitur.addEventListener('mouseover', () => closeFitur.style.opacity = '1');
closeFitur.addEventListener('mouseout', () => closeFitur.style.opacity = '0.6');

let currentInfoTab = 0; // 0: Lab Kosong, 1: Posisi Dosen, 2: Kode Kelas

function animateTabContent(element, direction) {
  element.style.animation = 'none';
  void element.offsetWidth; // trigger reflow
  element.style.animation = direction === 'left' ? 'slideInLeftTab 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'slideInRightTab 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
}

tabLabKosong.addEventListener('click', () => {
  tabLabKosong.style.background = 'var(--primary)';
  tabLabKosong.style.color = '#fff';
  tabLabKosong.style.boxShadow = 'var(--shadow-sm)';

  tabCariDosen.style.background = 'transparent';
  tabCariDosen.style.color = 'var(--text-muted)';
  tabCariDosen.style.boxShadow = 'none';

  tabCariKelas.style.background = 'transparent';
  tabCariKelas.style.color = 'var(--text-muted)';
  tabCariKelas.style.boxShadow = 'none';

  const prevTab = currentInfoTab;
  currentInfoTab = 0;
  contentCariDosen.style.display = 'none';
  contentCariKelas.style.display = 'none';
  contentLabKosong.style.display = 'block';

  if (prevTab !== 0) {
    animateTabContent(contentLabKosong, prevTab > 0 ? 'left' : 'right');
  }
});

tabCariDosen.addEventListener('click', () => {
  tabCariDosen.style.background = 'var(--primary)';
  tabCariDosen.style.color = '#fff';
  tabCariDosen.style.boxShadow = 'var(--shadow-sm)';

  tabLabKosong.style.background = 'transparent';
  tabLabKosong.style.color = 'var(--text-muted)';
  tabLabKosong.style.boxShadow = 'none';

  tabCariKelas.style.background = 'transparent';
  tabCariKelas.style.color = 'var(--text-muted)';
  tabCariKelas.style.boxShadow = 'none';

  const prevTab = currentInfoTab;
  currentInfoTab = 1;
  contentLabKosong.style.display = 'none';
  contentCariKelas.style.display = 'none';
  contentCariDosen.style.display = 'block';

  if (prevTab !== 1) {
    animateTabContent(contentCariDosen, prevTab > 1 ? 'left' : 'right');
  }
});

tabCariKelas.addEventListener('click', () => {
  tabCariKelas.style.background = 'var(--primary)';
  tabCariKelas.style.color = '#fff';
  tabCariKelas.style.boxShadow = 'var(--shadow-sm)';

  tabLabKosong.style.background = 'transparent';
  tabLabKosong.style.color = 'var(--text-muted)';
  tabLabKosong.style.boxShadow = 'none';

  tabCariDosen.style.background = 'transparent';
  tabCariDosen.style.color = 'var(--text-muted)';
  tabCariDosen.style.boxShadow = 'none';

  const prevTab = currentInfoTab;
  currentInfoTab = 2;
  contentLabKosong.style.display = 'none';
  contentCariDosen.style.display = 'none';
  contentCariKelas.style.display = 'block';

  if (prevTab !== 2) {
    animateTabContent(contentCariKelas, prevTab > 2 ? 'left' : 'right');
  }
});

btnSubmitLabKosong.addEventListener('click', async () => {
  const kampus = document.getElementById('filter-fitur-kampus').value;
  const tanggal = document.getElementById('fitur-tanggal').value;
  const jenis = document.getElementById('filter-jenis-ruangan').value;
  const resContainer = document.getElementById('result-lab-kosong');

  if (!tanggal) {
    alert("Pilih tanggal dulu!");
    return;
  }

  resContainer.innerHTML = '<p style="text-align:center;">Mencari data...</p>';

  try {
    const response = await fetch(`${API_BASE_URL}/api/cek_kosong?kampus=${kampus}&tanggal=${tanggal}&jenis=${jenis}`);
    const result = await response.json();

    if (result.status === 'success') {
      let html = '';
      result.data.forEach(room => {
        if (room.status === 'full kosong aja') {
          html += `<div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); text-align: left;">
                <strong style="display:flex; align-items:center; gap:6px;">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--badge-tm)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ${room.ruangan}
                </strong>
                <div style="padding-left: 24px; color: var(--text-muted); font-size: 0.9em; margin-top:4px;">Kosong seharian penuh</div>
              </div>`;
        } else {
          if (room.gaps && room.gaps.length > 0) {
            let gapsHtml = room.gaps.map(g => `<li>${g.start} - ${g.end} kosong ${g.note ? `<i>(${g.note})</i>` : ''}</li>`).join('');
            html += `<div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); text-align: left;">
                  <strong style="display:flex; align-items:center; gap:6px;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--badge-wa)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> ${room.ruangan}
                  </strong>
                  <div style="padding-left: 24px; color: var(--text-muted); font-size: 0.85em; margin-top:4px; margin-bottom: 4px;">Ada jam kosong pada:</div>
                  <ul style="padding-left: 44px; color: var(--text-muted); font-size: 0.85em; margin-top:0; margin-bottom: 0;">${gapsHtml}</ul>
                </div>`;
          } else {
            html += `<div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); text-align: left;">
                  <strong style="display:flex; align-items:center; gap:6px;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--badge-cc)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> ${room.ruangan}
                  </strong>
                  <div style="padding-left: 24px; color: var(--text-muted); font-size: 0.85em; margin-top:4px;">Terpakai penuh (Full Kelas)</div>
                </div>`;
          }
        }
      });
      if (!html) html = '<p style="text-align:center;">Tidak ada lab terdaftar.</p>';
      resContainer.innerHTML = html;
    } else {
      let msg = result.message;
      if (msg.includes("Belum ada data") || msg.includes("Libur")) {
        resContainer.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 20px 10px;">${msg}</p>`;
      } else {
        resContainer.innerHTML = `<p style="color:var(--badge-cc); text-align:center; padding: 20px 10px;">Error: ${msg}</p>`;
      }
    }
  } catch (err) {
    resContainer.innerHTML = `<p style="color:var(--badge-cc); text-align:center;">Koneksi gagal.</p>`;
  }
});

btnSubmitCariDosen.addEventListener('click', async () => {
  const nama = document.getElementById('fitur-nama-dosen').value;
  const resContainer = document.getElementById('result-cari-dosen');

  if (!nama) {
    alert("Masukkan nama dosen dulu!");
    return;
  }

  resContainer.innerHTML = '<p style="text-align:center;">Mencari data...</p>';

  try {
    const tanggalFilter = document.getElementById('filter-tanggal') ? document.getElementById('filter-tanggal').value : '';
    const url = tanggalFilter
      ? `${API_BASE_URL}/api/cari_dosen?nama=${encodeURIComponent(nama)}&tanggal=${encodeURIComponent(tanggalFilter)}`
      : `${API_BASE_URL}/api/cari_dosen?nama=${encodeURIComponent(nama)}`;
    const response = await fetch(url);
    const result = await response.json();

    if (result.status === 'success') {
      if (result.data.length === 0) {
        resContainer.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Tidak ada jadwal hari ini untuk dosen tersebut.</p>';
        return;
      }

      let html = '';
      result.data.forEach(item => {
        html += `<div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); text-align: left;">
              <div style="font-weight: 600; margin-bottom: 4px;">${item.nama_mk} (${item.kelas})</div>
              <div style="font-size: 0.9em; color: var(--text-muted); display:flex; flex-direction:column; gap:4px;">
                <span style="display:flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${item.waktu}</span>
                <span style="display:flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${item.nama_ruangan} (${item.kampus})</span>
                <span style="display:flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> ${item.nama_dosen}</span>
              </div>
            </div>`;
      });
      resContainer.innerHTML = html;
    } else {
      resContainer.innerHTML = `<p style="color:var(--badge-cc); text-align:center;">Error: ${result.message}</p>`;
    }
  } catch (err) {
    resContainer.innerHTML = `<p style="color:var(--badge-cc); text-align:center;">Koneksi gagal.</p>`;
  }
});

btnSubmitCariKelas.addEventListener('click', async () => {
  const kode = document.getElementById('fitur-kode-kelas').value;
  const resContainer = document.getElementById('result-cari-kelas');

  if (!kode) {
    alert("Masukkan kode kelas dulu!");
    return;
  }

  resContainer.innerHTML = '<p style="text-align:center;">Mencari data...</p>';

  try {
    const tanggalFilter = document.getElementById('filter-tanggal') ? document.getElementById('filter-tanggal').value : '';
    const url = tanggalFilter
      ? `${API_BASE_URL}/api/cari_kelas?kode=${encodeURIComponent(kode)}&tanggal=${encodeURIComponent(tanggalFilter)}`
      : `${API_BASE_URL}/api/cari_kelas?kode=${encodeURIComponent(kode)}`;
    const response = await fetch(url);
    const result = await response.json();

    if (result.status === 'success') {
      if (result.data.length === 0) {
        resContainer.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Tidak ada jadwal kelas tersebut hari ini.</p>';
        return;
      }

      let html = '';
      result.data.forEach(item => {
        html += `<div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); text-align: left;">
              <div style="font-weight: 600; margin-bottom: 4px;">${item.nama_mk} (${item.kelas})</div>
              <div style="font-size: 0.9em; color: var(--text-muted); display:flex; flex-direction:column; gap:4px;">
                <span style="display:flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${item.waktu}</span>
                <span style="display:flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${item.nama_ruangan} (${item.kampus})</span>
                <span style="display:flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> ${item.nama_dosen}</span>
              </div>
            </div>`;
      });
      resContainer.innerHTML = html;
    } else {
      resContainer.innerHTML = `<p style="color:var(--badge-cc); text-align:center;">Error: ${result.message}</p>`;
    }
  } catch (err) {
    resContainer.innerHTML = `<p style="color:var(--badge-cc); text-align:center;">Koneksi gagal.</p>`;
  }
});

// ─── Generic Modal Closer (Click Outside & Escape Key) ───
function closeAnyModal(modal) {
  if (!modal) return;
  const id = modal.id;
  if (id === 'modal-fitur') document.getElementById('modal-close')?.click();
  else if (id === 'password-modal') document.getElementById('password-cancel-btn')?.click();
  else if (id === 'danger-modal') document.getElementById('danger-cancel-btn')?.click();
  else if (id === 'test-wa-modal') document.getElementById('wa-modal-close-btn')?.click();
  else if (id === 'room-detail-modal') document.getElementById('room-detail-close-btn')?.click();
  else if (id === 'modal-fs-info') closeFullscreenInfoModal();
  // lab-modal is already handled by its own listeners, but we can fallback here:
  else if (id === 'lab-modal') document.getElementById('modal-close-btn')?.click();
  else if (id === 'alert-modal') document.getElementById('alert-modal-close-btn')?.click();
  else if (id === 'modal-fs-filter') closeFullscreenFilterModal();
  else modal.classList.remove('open');
}

const ALERT_SVGS = {
  success: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--badge-tm)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  error: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--badge-cc)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  warning: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--badge-wa)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  info: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

// Generic Custom Alert function
function showCustomAlert(title, message, icon = 'info') {
  const alertModal = document.getElementById('alert-modal');
  document.getElementById('alert-modal-title').textContent = title;
  document.getElementById('alert-modal-message').textContent = message;

  const iconEl = document.getElementById('alert-modal-icon');
  if (iconEl) {
    if (icon === '✅' || icon === 'success') iconEl.innerHTML = ALERT_SVGS.success;
    else if (icon === '❌' || icon === 'error') iconEl.innerHTML = ALERT_SVGS.error;
    else if (icon === '⚠️' || icon === 'warning') iconEl.innerHTML = ALERT_SVGS.warning;
    else iconEl.innerHTML = ALERT_SVGS.info;
  }

  alertModal.classList.add('open');

  document.getElementById('alert-modal-close-btn').onclick = () => {
    alertModal.classList.remove('open');
  };
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
    closeAnyModal(e.target);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const openModals = document.querySelectorAll('.modal-overlay.open, #modal-fs-filter, #modal-fs-info');
    // Close the top-most modal first (last in DOM or highest z-index)
    if (openModals.length > 0) {
      const topModal = openModals[openModals.length - 1];
      if (topModal.id === 'modal-fs-filter' && topModal.style.display !== 'none') {
        closeFullscreenFilterModal();
        return;
      }
      if (topModal.id === 'modal-fs-info' && topModal.style.display !== 'none') {
        closeFullscreenInfoModal();
        return;
      }
      closeAnyModal(topModal);
    }
  }
});

// ─── Bridge Chrome Extension Listener ───
window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "UNAMA_EXTENSION_READY") {
    window.__UNAMA_EXTENSION_ACTIVE = true;
  }
});

// ─── Modal Filter Fullscreen Logic ───
window.selectFsModalOption = function (type, value, label) {
  // 1. Update FS Modal UI
  const fsLabel = document.getElementById(`label-fs-${type}`);
  if (fsLabel) fsLabel.innerText = label;

  const fsVal = document.getElementById(`fs-val-${type}`);
  if (fsVal) fsVal.value = value;

  const fsItems = document.querySelectorAll(`#dropdown-fs-${type} .aslab-list-item`);
  fsItems.forEach(item => {
    const itemVal = item.getAttribute('data-value') || item.innerText.trim();
    if (itemVal === value || (value === 'semua' && (itemVal === 'semua' || itemVal.startsWith('Semua')))) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Close modal dropdown
  const fsDropdown = document.getElementById(`dropdown-fs-${type}`);
  if (fsDropdown) fsDropdown.classList.remove('open');

  // 2. Sync to main dashboard controls
  selectCustomOption(type, value, label);

  // 3. Update ruangan dropdown inside modal if dependent filter changes
  if (type === 'kampus' || type === 'kategori-ruang' || type === 'waktu' || type === 'metode') {
    syncFsModalRuanganDropdown();
  }
};

function syncFsModalRuanganDropdown() {
  const fsRuangDropdown = document.getElementById('dropdown-fs-ruangan');
  const mainRuanganItems = document.querySelectorAll('#dropdown-ruangan .aslab-list-item');
  if (!fsRuangDropdown) return;

  const curRuangVal = document.getElementById('filter-ruangan')?.value || 'semua';
  const curRuangLabel = document.getElementById('label-ruangan')?.innerText || 'Semua Ruangan';

  const labelFsRuangan = document.getElementById('label-fs-ruangan');
  if (labelFsRuangan) labelFsRuangan.innerText = curRuangLabel;

  let html = '';
  mainRuanganItems.forEach(item => {
    const val = item.getAttribute('data-value') || item.innerText.trim();
    const text = item.innerText.trim();
    const isActive = (val === curRuangVal || (curRuangVal === 'semua' && (val === 'semua' || val === 'Semua Ruangan')));
    html += `<div class="aslab-list-item ${isActive ? 'active' : ''}" data-value="${val}" onclick="selectFsModalOption('ruangan', '${val}', '${text.replace(/'/g, "\\'")}')">${text}</div>`;
  });

  fsRuangDropdown.innerHTML = html;
}

window.openFullscreenFilterModal = function () {
  const modal = document.getElementById('modal-fs-filter');
  if (!modal) return;

  try {
    // Populate current values from main filter controls
    const curTanggal = document.getElementById('filter-tanggal')?.value || '';
    const curWaktu = document.getElementById('filter-waktu')?.value || 'semua';
    const curWaktuLabel = document.getElementById('label-waktu')?.innerText || 'Semua Waktu';
    const curMetode = document.getElementById('filter-metode')?.value || 'semua';
    const curMetodeLabel = document.getElementById('label-metode')?.innerText || 'Semua Status';
    const curKampus = document.getElementById('filter-kampus')?.value || 'semua';
    const curKampusLabel = document.getElementById('label-kampus')?.innerText || 'Semua Kampus';
    const curKategori = document.getElementById('filter-kategori-ruang')?.value || 'semua';
    const curKategoriLabel = document.getElementById('label-kategori-ruang')?.innerText || 'Semua Kategori';
    const curRuangan = document.getElementById('filter-ruangan')?.value || 'semua';
    const curRuanganLabel = document.getElementById('label-ruangan')?.innerText || 'Semua Ruangan';

    // 1. Tanggal Flatpickr
    const fsTanggal = document.getElementById('fs-filter-tanggal');
    if (fsTanggal) {
      fsTanggal.value = curTanggal;
      if (!fsTanggal._flatpickr && typeof flatpickr !== 'undefined') {
        flatpickr(fsTanggal, {
          dateFormat: "Y-m-d",
          static: true,
          disableMobile: true,
          defaultDate: curTanggal || undefined,
          onChange: function (selectedDates, dateStr, instance) {
            if (instance) instance.close();
            syncFilterFromModal('tanggal', dateStr);
            // Langsung sinkron otomatis tanpa harus klik tombol
            if (dateStr) {
              syncDataFromModal();
            }
          }
        });
      } else if (curTanggal && fsTanggal._flatpickr) {
        fsTanggal._flatpickr.setDate(curTanggal, false);
      } else if (fsTanggal._flatpickr) {
        fsTanggal._flatpickr.clear();
      }
    }

    // 2. Waktu
    const fsLabelWaktu = document.getElementById('label-fs-waktu');
    if (fsLabelWaktu) fsLabelWaktu.innerText = curWaktuLabel;
    const mainWaktuItems = document.querySelectorAll('#dropdown-waktu .aslab-list-item');
    const fsWaktuDropdown = document.getElementById('dropdown-fs-waktu');
    if (fsWaktuDropdown && mainWaktuItems.length > 0) {
      let htmlWaktu = '';
      mainWaktuItems.forEach(item => {
        const val = item.getAttribute('data-value') || '';
        const text = item.innerText.trim();
        const isActive = (val === curWaktu);
        htmlWaktu += `<div class="aslab-list-item ${isActive ? 'active' : ''}" data-value="${val}" onclick="selectFsModalOption('waktu', '${val}', '${text.replace(/'/g, "\\'")}')">${text}</div>`;
      });
      fsWaktuDropdown.innerHTML = htmlWaktu;
    }

    // 3. Status Kuliah (Metode)
    const fsLabelMetode = document.getElementById('label-fs-metode');
    if (fsLabelMetode) fsLabelMetode.innerText = curMetodeLabel;
    document.querySelectorAll('#dropdown-fs-metode .aslab-list-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-value') === curMetode);
    });

    // 4. Lokasi Kampus
    const fsLabelKampus = document.getElementById('label-fs-kampus');
    if (fsLabelKampus) fsLabelKampus.innerText = curKampusLabel;
    document.querySelectorAll('#dropdown-fs-kampus .aslab-list-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-value') === curKampus);
    });

    // 5. Kategori Ruangan
    const fsLabelKategori = document.getElementById('label-fs-kategori-ruang');
    if (fsLabelKategori) fsLabelKategori.innerText = curKategoriLabel;
    document.querySelectorAll('#dropdown-fs-kategori-ruang .aslab-list-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-value') === curKategori);
    });

    // 6. Ruangan / Labor
    syncFsModalRuanganDropdown();
  } catch (err) {
    console.error("Error setting up filter modal:", err);
  }

  const feedback = document.getElementById('fs-modal-sync-feedback');
  if (feedback) feedback.style.display = 'none';

  modal.classList.add('open');
  modal.style.display = 'flex';
};

window.closeFullscreenFilterModal = function () {
  const modal = document.getElementById('modal-fs-filter');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
};

window.syncFilterFromModal = function (type, value) {
  if (type === 'tanggal') {
    const mainTanggal = document.getElementById('filter-tanggal');
    if (mainTanggal) {
      mainTanggal.value = value;
      if (mainTanggal._flatpickr) {
        mainTanggal._flatpickr.setDate(value, false);
      }
    }
    updateRuanganFilterOptions();
    if (typeof updateActiveLabPanel === 'function') updateActiveLabPanel();
    syncFsModalRuanganDropdown();
    applyFilters();
  }
};

window.syncDataFromModal = async function () {
  const fsTanggal = document.getElementById('fs-filter-tanggal');
  const tanggal = fsTanggal ? fsTanggal.value : '';
  const feedback = document.getElementById('fs-modal-sync-feedback');
  const btnSync = document.getElementById('btn-fs-modal-sync');

  if (!tanggal) {
    if (feedback) {
      feedback.style.display = 'block';
      feedback.style.background = 'var(--badge-cc-bg)';
      feedback.style.color = 'var(--badge-cc)';
      feedback.innerText = 'Pilih tanggal terlebih dahulu!';
    }
    return;
  }

  if (feedback) {
    feedback.style.display = 'block';
    feedback.style.background = 'var(--badge-ol-bg)';
    feedback.style.color = 'var(--badge-ol)';
    feedback.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> Sedang menyinkronkan data di background...</span>';
  }

  if (btnSync) btnSync.disabled = true;

  try {
    await syncData(tanggal);
    if (feedback) {
      feedback.style.background = 'var(--badge-tm-bg)';
      feedback.style.color = 'var(--badge-tm)';
      feedback.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--badge-tm)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Sinkronisasi tanggal berhasil!</span>';
      setTimeout(() => {
        if (feedback) feedback.style.display = 'none';
      }, 3000);
    }
  } catch (e) {
    if (feedback) {
      feedback.style.background = 'var(--badge-cc-bg)';
      feedback.style.color = 'var(--badge-cc)';
      feedback.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--badge-cc)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Gagal sinkronisasi.</span>';
    }
  } finally {
    if (btnSync) btnSync.disabled = false;
  }
};

window.resetAllFiltersFromModal = function () {
  const mainTanggal = document.getElementById('filter-tanggal');
  if (mainTanggal) {
    mainTanggal.value = '';
    if (mainTanggal._flatpickr) mainTanggal._flatpickr.clear();
  }

  const fsTanggal = document.getElementById('fs-filter-tanggal');
  if (fsTanggal) {
    fsTanggal.value = '';
    if (fsTanggal._flatpickr) fsTanggal._flatpickr.clear();
  }

  selectCustomOption('waktu', 'semua', 'Semua Waktu');
  selectCustomOption('metode', 'semua', 'Semua Status');
  selectCustomOption('kampus', 'semua', 'Semua Kampus');
  selectCustomOption('kategori-ruang', 'semua', 'Semua Kategori');
  selectCustomOption('ruangan', 'semua', 'Semua Ruangan');

  openFullscreenFilterModal();
};

// ─── Fullscreen Mode untuk Status Penggunaan Ruangan ───
let fsClockInterval = null;

function updateFullscreenClock() {
  const clockTime = document.getElementById('fs-clock-time');
  const clockDate = document.getElementById('fs-clock-date');
  if (!clockTime || !clockDate) return;

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const secs = String(now.getSeconds()).padStart(2, '0');
  clockTime.textContent = `${hours}:${mins}:${secs}`;

  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const dayName = days[now.getDay()];
  const dateNum = now.getDate();
  const monthName = months[now.getMonth()];
  const year = now.getFullYear();

  clockDate.textContent = `${dayName}, ${dateNum} ${monthName} ${year}`;
}

window.openFullscreenInfoModal = function () {
  const modal = document.getElementById('modal-fs-info');
  if (!modal) return;

  const liveWarnings = document.getElementById('live-warnings')?.innerHTML || '';
  const fsWarnings = document.getElementById('fs-live-warnings');
  if (fsWarnings) fsWarnings.innerHTML = liveWarnings;

  // Sync active tab buttons state
  document.querySelectorAll('.info-mase-tab-btn').forEach(btn => {
    const btnTab = btn.getAttribute('data-tab');
    btn.classList.toggle('active', btnTab === activeInfoMaseTab);
  });

  renderInfoMaseNotifications(false);

  modal.style.display = 'flex';
  modal.classList.add('open');
};

window.closeFullscreenInfoModal = function () {
  const modal = document.getElementById('modal-fs-info');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
  }
};

function onFullscreenEnter() {
  const section = document.getElementById('section-status-ruangan');
  if (section) section.classList.add('is-fullscreen');

  const iconEnter = document.getElementById('icon-fs-enter');
  const iconExit = document.getElementById('icon-fs-exit');
  const textBtn = document.getElementById('text-fs-button');
  const clockContainer = document.getElementById('fullscreen-live-clock');
  const fsInfoBtn = document.getElementById('btn-fs-info-modal');

  if (iconEnter) iconEnter.style.display = 'none';
  if (iconExit) iconExit.style.display = 'inline-block';
  if (textBtn) textBtn.textContent = 'Keluar Full Screen';
  if (clockContainer) clockContainer.style.display = 'inline-flex';
  if (fsInfoBtn) fsInfoBtn.style.display = 'inline-flex';

  updateFullscreenClock();
  if (fsClockInterval) clearInterval(fsClockInterval);
  fsClockInterval = setInterval(updateFullscreenClock, 1000);
}

function onFullscreenExit() {
  const section = document.getElementById('section-status-ruangan');
  if (section) section.classList.remove('is-fullscreen');

  const iconEnter = document.getElementById('icon-fs-enter');
  const iconExit = document.getElementById('icon-fs-exit');
  const textBtn = document.getElementById('text-fs-button');
  const clockContainer = document.getElementById('fullscreen-live-clock');
  const fsInfoBtn = document.getElementById('btn-fs-info-modal');

  if (iconEnter) iconEnter.style.display = 'inline-block';
  if (iconExit) iconExit.style.display = 'none';
  if (textBtn) textBtn.textContent = 'Full Screen';
  if (clockContainer) clockContainer.style.display = 'none';
  if (fsInfoBtn) fsInfoBtn.style.display = 'none';
  closeFullscreenInfoModal();

  if (fsClockInterval) {
    clearInterval(fsClockInterval);
    fsClockInterval = null;
  }
}

window.toggleFullscreenRuangan = function () {
  const section = document.getElementById('section-status-ruangan');
  if (!section) return;

  const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || section.classList.contains('is-fullscreen');

  if (!isFs) {
    if (section.requestFullscreen) {
      section.requestFullscreen().catch(() => {
        onFullscreenEnter();
      });
    } else if (section.webkitRequestFullscreen) {
      section.webkitRequestFullscreen();
    } else if (section.mozRequestFullScreen) {
      section.mozRequestFullScreen();
    } else if (section.msRequestFullscreen) {
      section.msRequestFullscreen();
    } else {
      onFullscreenEnter();
    }
  } else {
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        onFullscreenExit();
      });
    } else if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen && document.mozFullScreenElement) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen && document.msFullscreenElement) {
      document.msExitFullscreen();
    } else {
      onFullscreenExit();
    }
  }
};

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) onFullscreenEnter();
  else onFullscreenExit();
});
document.addEventListener('webkitfullscreenchange', () => {
  if (document.webkitFullscreenElement) onFullscreenEnter();
  else onFullscreenExit();
});
document.addEventListener('mozfullscreenchange', () => {
  if (document.mozFullScreenElement) onFullscreenEnter();
  else onFullscreenExit();
});
document.addEventListener('MSFullscreenChange', () => {
  if (document.msFullscreenElement) onFullscreenEnter();
  else onFullscreenExit();
});

flatpickr("input[type='date'], #filter-tanggal", {
  dateFormat: "Y-m-d",
  disableMobile: true,
  onChange: function (selectedDates, dateStr, instance) {
    if (instance) instance.close();
    if (dateStr) {
      const mainTanggal = document.getElementById('filter-tanggal');
      if (mainTanggal) mainTanggal.value = dateStr;
      updateRuanganFilterOptions();
      applyFilters();
      if (typeof updateActiveLabPanel === 'function') updateActiveLabPanel();
      syncData(dateStr);
    }
  }
});


// ==========================================
// AUTO-REFRESH LOGIC (Untuk PC Server Lab 24/7)
// ==========================================
setInterval(async () => {
  // Hanya lakukan auto-refresh jika tidak ada modal terbuka (agar tidak mengganggu Admin yang sedang edit data)
  const modals = document.querySelectorAll('.modal.open, .modal-overlay.open');
  let isModalOpen = false;
  modals.forEach(m => {
    if (m.style.display !== 'none' && getComputedStyle(m).display !== 'none') {
      isModalOpen = true;
    }
  });
  
  const testWaModal = document.getElementById('test-wa-modal');
  if (testWaModal && (testWaModal.classList.contains('open') || testWaModal.style.display === 'flex' || testWaModal.style.display === 'block')) {
      isModalOpen = true;
  }

  if (isModalOpen) return;

  try {
    // 1. Refresh Jadwal
    const resJadwal = await fetch(`${API_BASE_URL}/api/jadwal?_t=${Date.now()}`);
    const dataJadwal = await resJadwal.json();
    if (dataJadwal.status === 'success') {
      allJadwal = dataJadwal.data;
      updateJadwalTable();
      if (typeof updateActiveLabPanel === 'function') updateActiveLabPanel();
    }

    // 2. Refresh Data Master (Ruangan)
    const resRuangan = await fetch(`${API_BASE_URL}/api/ruangan?_t=${Date.now()}`);
    const dataRuangan = await resRuangan.json();
    if (dataRuangan.status === 'success') {
      allRuanganData = dataRuangan.data;
    }

    // 3. Refresh Data Aslab 
    const resAslab = await fetch(`${API_BASE_URL}/api/aslab?_t=${Date.now()}`);
    const dataAslab = await resAslab.json();
    if (dataAslab.status === 'success') {
      globalAslabData = dataAslab.data;
    }

    // 4. Refresh Notifikasi Info Mase
    const tgl = document.getElementById('filter-tanggal')?.value;
    if (tgl) {
      await fetchNotifikasiLab(tgl, false);
    }

  } catch (err) {
    console.error("Gagal melakukan auto-refresh background:", err);
  }
}, 60 * 1000); // Polling setiap 1 menit (60000ms)


// =========================================================================
// PWA SERVICE WORKER REGISTRATION
// =========================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration skipped:', err);
    });
  });
}


// =========================================================================
// CALENDAR SYNC (.ICS & GOOGLE CALENDAR)
// =========================================================================
function parseDateAndTimeToISO(dateStr, timeRangeStr) {
  let startHour = 8, startMin = 0, endHour = 10, endMin = 0;
  if (timeRangeStr) {
    const parts = timeRangeStr.split(/[-–—]/).map(p => p.trim());
    if (parts[0]) {
      const [h, m] = parts[0].split(':').map(Number);
      if (!isNaN(h)) startHour = h;
      if (!isNaN(m)) startMin = m;
    }
    if (parts[1]) {
      const [h, m] = parts[1].split(':').map(Number);
      if (!isNaN(h)) endHour = h;
      if (!isNaN(m)) endMin = m;
    } else {
      endHour = startHour + 2;
      endMin = startMin;
    }
  }

  const cleanDate = (dateStr || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const pad = n => String(n).padStart(2, '0');
  const startISO = `${cleanDate}T${pad(startHour)}${pad(startMin)}00`;
  const endISO = `${cleanDate}T${pad(endHour)}${pad(endMin)}00`;
  return { startISO, endISO, startHour, startMin, endHour, endMin };
}

function openSingleGoogleCalendar(item) {
  if (!item) return;
  const { startISO, endISO } = parseDateAndTimeToISO(item.tanggal, item.jam);
  const title = encodeURIComponent(`${item.nama_mk || 'Kuliah'} (${item.kelas || '-'})`);
  const details = encodeURIComponent(`Mata Kuliah: ${item.nama_mk || '-'}\nDosen: ${item.nama_dosen || '-'}\nStatus: ${item.status_jadwal || item.metode_pembelajaran || '-'}\nRuangan: ${item.nama_ruangan || '-'}`);
  const location = encodeURIComponent(`${item.nama_ruangan || 'UNAMA'} - Kampus ${item.kampus || 'UNAMA'}`);
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startISO}/${endISO}&details=${details}&location=${location}`;
  window.open(url, '_blank');
}

let _isExportingExcel = false;
function exportFilteredSchedulesToExcel() {
  if (_isExportingExcel) return;
  _isExportingExcel = true;
  setTimeout(() => { _isExportingExcel = false; }, 1500);

  const targetData = (Array.isArray(window._currentFilteredJadwal) && window._currentFilteredJadwal.length > 0)
    ? window._currentFilteredJadwal
    : (Array.isArray(allJadwal) ? allJadwal : []);

  if (targetData.length === 0) {
    if (typeof showAlert === 'function') {
      showAlert('warning', 'Peringatan', 'Tidak ada data jadwal untuk diexport.');
    } else {
      alert('Tidak ada data jadwal untuk diexport.');
    }
    return;
  }

  const selectedDate = document.getElementById('filter-tanggal')?.value;
  const now = new Date();
  const tanggalExportStr = selectedDate || now.toISOString().slice(0, 10);
  const tanggalFormatIndo = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Jadwal Kuliah UNAMA</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
      <style>
        table { border-collapse: collapse; width: 100%; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10.5pt; }
        th { background-color: #4f46e5; color: #ffffff; font-weight: bold; border: 1px solid #3730a3; padding: 10px 12px; text-align: left; }
        td { border: 1px solid #cbd5e1; padding: 8px 10px; vertical-align: middle; }
        tr:nth-child(even) td { background-color: #f8fafc; }
        .text-center { text-align: center; }
        .badge-tm { background-color: #d1fae5; color: #065f46; font-weight: bold; text-align: center; }
        .badge-ol { background-color: #dbeafe; color: #1e40af; font-weight: bold; text-align: center; }
        .badge-cc { background-color: #fee2e2; color: #991b1b; font-weight: bold; text-align: center; }
      </style>
    </head>
    <body>
      <h2 style="color:#1e1b4b; margin-bottom:4px;">JADWAL PERKULIAHAN & LABORATORIUM UNAMA</h2>
      <p style="color:#64748b; margin-top:0;">Universitas Dinamika Bangsa • Tanggal: ${escapeHtml(tanggalFormatIndo)} • Total: ${targetData.length} Jadwal</p>
      <table>
        <thead>
          <tr>
            <th class="text-center" style="width: 45px;">No</th>
            <th style="width: 90px;">Hari</th>
            <th style="width: 100px;">Tanggal</th>
            <th style="width: 120px;">Jam Kuliah</th>
            <th style="width: 260px;">Mata Kuliah</th>
            <th style="width: 80px;">Kelas</th>
            <th style="width: 220px;">Dosen Pengampu</th>
            <th style="width: 180px;">Ruangan / Lab</th>
            <th style="width: 130px;">Kampus</th>
            <th style="width: 120px;">Status</th>
            <th class="text-center" style="width: 90px;">Metode</th>
          </tr>
        </thead>
        <tbody>
  `;

  targetData.forEach((item, index) => {
    let metodeBadge = item.metode_pembelajaran || '-';
    let metodeClass = '';
    if (metodeBadge === 'TM') metodeClass = 'badge-tm';
    else if (metodeBadge === 'OL') metodeClass = 'badge-ol';
    else if (metodeBadge === 'CC') metodeClass = 'badge-cc';

    html += `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td>${escapeHtml(item.hari || '-')}</td>
        <td>${escapeHtml(item.tanggal || '-')}</td>
        <td>${escapeHtml(item.jam || '-')}</td>
        <td><strong>${escapeHtml(item.nama_mk || '-')}</strong></td>
        <td>${escapeHtml(item.kelas || '-')}</td>
        <td>${escapeHtml(item.nama_dosen || '-')}</td>
        <td>${escapeHtml(item.nama_ruangan || '-')}</td>
        <td>${escapeHtml(item.kampus || 'UNAMA')}</td>
        <td>${escapeHtml(item.status_jadwal || (item.metode_pembelajaran === 'OL' ? 'Online' : '-'))}</td>
        <td class="${metodeClass}">${escapeHtml(metodeBadge)}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = `Jadwal_Kuliah_UNAMA_${tanggalExportStr}.xls`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

let _isExportingICS = false;
function exportFilteredSchedulesToICS() {
  if (_isExportingICS) return;
  _isExportingICS = true;
  setTimeout(() => { _isExportingICS = false; }, 1500);
  const targetData = (Array.isArray(window._currentFilteredJadwal) && window._currentFilteredJadwal.length > 0)
    ? window._currentFilteredJadwal
    : (allJadwal || []);

  if (!targetData || targetData.length === 0) {
    alert('Tidak ada data jadwal untuk diexport. Silakan pilih tanggal atau filter jadwal terlebih dahulu.');
    return;
  }

  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UNAMA//Jadwal Kuliah UNAMA//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Jadwal Kuliah UNAMA',
    'X-WR-TIMEZONE:Asia/Jakarta'
  ];

  targetData.forEach((item, idx) => {
    const { startISO, endISO } = parseDateAndTimeToISO(item.tanggal, item.jam);
    const uid = `unama-${item.id || idx}-${Date.now()}@unama.ac.id`;
    const summary = `${item.nama_mk || 'Kuliah'} (${item.kelas || '-'})`;
    const description = `Dosen: ${item.nama_dosen || '-'}\\nRuangan: ${item.nama_ruangan || '-'}\\nMetode: ${item.metode_pembelajaran || '-'}`;
    const location = `${item.nama_ruangan || 'UNAMA'}`;

    icsLines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART:${startISO}`,
      `DTEND:${endISO}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Pengingat Kuliah UNAMA (15 menit lagi)',
      'END:VALARM',
      'END:VEVENT'
    );
  });

  icsLines.push('END:VCALENDAR');

  const icsBlob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(icsBlob);
  const tglStr = document.getElementById('filter-tanggal')?.value || 'semua';
  downloadLink.download = `jadwal_unama_${tglStr}.ics`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}


// =========================================================================
// SPOTLIGHT SEARCH (CTRL + K) — UPGRADED & RICH DETAILS (NO EMOJIS)
// =========================================================================
let spotlightActiveCategory = 'all';
let spotlightActiveIndex = 0;
window._spotlightCurrentResults = [];

const svgSearchIcons = {
  dosen: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
  mk: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
  ruangan: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 7v14M21 7v14M6 3h12a2 2 0 0 1 2 2v2H4V5a2 2 0 0 1 2-2zM9 10h2M13 10h2M9 14h2M13 14h2M9 18h2M13 18h2"></path></svg>',
  lab: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
  aslab: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>'
};

function openSpotlightModal() {
  const backdrop = document.getElementById('spotlight-backdrop');
  const input = document.getElementById('spotlight-input');
  if (backdrop && input) {
    backdrop.classList.add('open');
    input.value = '';
    spotlightActiveCategory = 'all';
    spotlightActiveIndex = 0;
    updateSpotlightCategoryTabs();
    renderSpotlightResults('');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
  }
}

function handleSpotlightInput(val) {
  const clearBtn = document.getElementById('spotlight-clear-btn');
  if (clearBtn) clearBtn.style.display = val ? 'inline-flex' : 'none';
  spotlightActiveIndex = 0;
  renderSpotlightResults((val || '').trim().toLowerCase());
}
window.handleSpotlightInput = handleSpotlightInput;

function closeSpotlightModal(e) {
  if (e && e.target) {
    const isBackdrop = e.target === document.getElementById('spotlight-backdrop');
    const isCloseBtn = e.target.closest('.spotlight-btn-close-wrap') || e.target.closest('.kbd-badge') || e.target.closest('.spotlight-btn-back');
    if (!isBackdrop && !isCloseBtn) {
      return;
    }
  }
  const backdrop = document.getElementById('spotlight-backdrop');
  if (backdrop) backdrop.classList.remove('open');
}

function clearSpotlightInput() {
  const input = document.getElementById('spotlight-input');
  const clearBtn = document.getElementById('spotlight-clear-btn');
  if (input) {
    input.value = '';
    input.focus();
    if (clearBtn) clearBtn.style.display = 'none';
    renderSpotlightResults('');
  }
}

function filterSpotlightCategory(category) {
  spotlightActiveCategory = category;
  spotlightActiveIndex = 0;
  updateSpotlightCategoryTabs();
  const input = document.getElementById('spotlight-input');
  renderSpotlightResults(input ? input.value.trim().toLowerCase() : '');
}

function updateSpotlightCategoryTabs() {
  document.querySelectorAll('.spotlight-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-type') === spotlightActiveCategory);
  });
}

document.addEventListener('keydown', (e) => {
  const backdrop = document.getElementById('spotlight-backdrop');
  const isSpotlightOpen = backdrop && backdrop.classList.contains('open');

  const detailBackdrop = document.getElementById('spotlight-detail-backdrop');
  const isDetailOpen = detailBackdrop && detailBackdrop.classList.contains('open');

  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (isSpotlightOpen) closeSpotlightModal();
    else openSpotlightModal();
    return;
  }

  if (isDetailOpen && e.key === 'Escape') {
    e.preventDefault();
    backToSpotlightModal();
    return;
  }

  if (isSpotlightOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSpotlightModal();
      return;
    }

    const items = window._spotlightCurrentResults || [];
    if (items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        spotlightActiveIndex = (spotlightActiveIndex + 1) % items.length;
        highlightSpotlightItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        spotlightActiveIndex = (spotlightActiveIndex - 1 + items.length) % items.length;
        highlightSpotlightItem();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSpotlightAction(spotlightActiveIndex);
      }
    }
  } else if (e.key === 'Escape') {
    if (typeof closeTvMode === 'function') closeTvMode();
  }
});

function highlightSpotlightItem() {
  const elements = document.querySelectorAll('.spotlight-item');
  elements.forEach((el, idx) => {
    const isSel = idx === spotlightActiveIndex;
    el.classList.toggle('selected', isSel);
    if (isSel) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

const spotlightInput = document.getElementById('spotlight-input');
if (spotlightInput) {
  spotlightInput.addEventListener('input', (e) => {
    const val = e.target.value;
    const clearBtn = document.getElementById('spotlight-clear-btn');
    if (clearBtn) clearBtn.style.display = val ? 'inline-block' : 'none';
    spotlightActiveIndex = 0;
    renderSpotlightResults(val.trim().toLowerCase());
  });
}

function renderSpotlightResults(query) {
  const container = document.getElementById('spotlight-results');
  if (!container) return;

  const cat = spotlightActiveCategory;
  const dosenResults = [];
  const mkResults = [];
  const roomResults = [];
  const aslabResults = [];

  // ==========================================
  // 1. DOSEN INDEXING (SEMUA DOSEN & TIM TEACHING)
  // ==========================================
  if ((cat === 'all' || cat === 'dosen') && Array.isArray(allJadwal)) {
    const dosenMap = new Map();

    allJadwal.forEach(item => {
      if (!item.nama_dosen) return;
      // Split multi-dosen (e.g. "Yovi Pratama, Lazuardi Yudha Pradana" or "Dr. X, M.Kom / Y, S.Kom")
      const rawNames = item.nama_dosen.split(/[,/&]/).map(n => n.trim()).filter(Boolean);

      rawNames.forEach(name => {
        if (!name || name === '-' || name.toLowerCase() === 'null') return;
        if (!dosenMap.has(name)) {
          dosenMap.set(name, {
            name: name,
            schedules: [],
            mkSet: new Set(),
            ruangSet: new Set()
          });
        }
        const d = dosenMap.get(name);
        d.schedules.push(item);
        if (item.nama_mk) d.mkSet.add(item.nama_mk);
        if (item.nama_ruangan) d.ruangSet.add(item.nama_ruangan);
      });
    });

    Array.from(dosenMap.values())
      .filter(d => !query || d.name.toLowerCase().includes(query) || Array.from(d.mkSet).some(m => m.toLowerCase().includes(query)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(d => {
        const mkList = Array.from(d.mkSet);
        const mkText = mkList.slice(0, 2).join(', ') + (mkList.length > 2 ? '...' : '');
        dosenResults.push({
          type: 'dosen',
          rawValue: d.name,
          badgeClass: 'badge-type-dosen',
          badgeText: 'DOSEN',
          svgIcon: svgSearchIcons.dosen,
          title: d.name,
          subtitle: `Dosen Pengampu • ${d.schedules.length} Sesi Kuliah • ${mkText || 'Jadwal Kuliah'}`
        });
      });
  }

  // ==========================================
  // 2. MATA KULIAH INDEXING
  // ==========================================
  if ((cat === 'all' || cat === 'mk') && Array.isArray(allJadwal)) {
    const mkMap = new Map();

    allJadwal.forEach(item => {
      if (!item.nama_mk) return;
      const mkName = item.nama_mk.trim();
      if (!mkMap.has(mkName)) {
        mkMap.set(mkName, {
          name: mkName,
          schedules: [],
          dosenSet: new Set(),
          kelasSet: new Set()
        });
      }
      const mk = mkMap.get(mkName);
      mk.schedules.push(item);
      if (item.nama_dosen) mk.dosenSet.add(item.nama_dosen);
      if (item.kelas) mk.kelasSet.add(item.kelas);
    });

    Array.from(mkMap.values())
      .filter(mk => !query || mk.name.toLowerCase().includes(query) || Array.from(mk.dosenSet).some(d => d.toLowerCase().includes(query)) || Array.from(mk.kelasSet).some(k => k.toLowerCase().includes(query)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(mk => {
        const dosenList = Array.from(mk.dosenSet);
        const dosenText = dosenList.slice(0, 2).join(', ') + (dosenList.length > 2 ? '...' : '');
        mkResults.push({
          type: 'mk',
          rawValue: mk.name,
          badgeClass: 'badge-type-mk',
          badgeText: 'MATKUL',
          svgIcon: svgSearchIcons.mk,
          title: mk.name,
          subtitle: `Mata Kuliah • ${mk.schedules.length} Kelas • Pengampu: ${dosenText || '-'}`
        });
      });
  }

  // ==========================================
  // 3. RUANGAN & LABOR (KAMPUS THEHOK -> KOBAR -> LAB -> KELAS)
  // ==========================================
  if (cat === 'all' || cat === 'ruangan') {
    const roomMap = new Map();

    const processRoom = (rawRoomName, explicitKampus = '') => {
      if (!rawRoomName || !rawRoomName.trim()) return;
      const originalName = rawRoomName.trim();

      // Bersihkan teks kampus berulang dari nama ruangan (misal: "Labor 1.3 (Kampus Thehok)" -> "Labor 1.3")
      const cleanTitle = originalName
        .replace(/\s*\(Kampus\s+(?:Thehok|Kobar)\)/gi, '')
        .replace(/\s*\((?:Thehok|Kobar)\)/gi, '')
        .trim();

      if (!cleanTitle) return;

      // Tentukan Kampus
      let kampus = (explicitKampus || '').trim();
      const lowerOrig = originalName.toLowerCase();
      if (!kampus) {
        if (lowerOrig.includes('thehok')) {
          kampus = 'Thehok';
        } else if (lowerOrig.includes('kobar')) {
          kampus = 'Kobar';
        }
      }

      // Jika belum terdeteksi, cari dari master allRuanganData
      if (!kampus && Array.isArray(allRuanganData)) {
        const found = allRuanganData.find(r => (r.nama_ruangan || '').toLowerCase().includes(cleanTitle.toLowerCase()));
        if (found && found.kampus) kampus = found.kampus;
      }

      const isThehok = kampus.toLowerCase().includes('thehok') || lowerOrig.includes('thehok');
      const isKobar = kampus.toLowerCase().includes('kobar') || lowerOrig.includes('kobar');

      let kampusLabel = 'UNAMA';
      let kampusPriority = 3;
      if (isThehok) {
        kampusLabel = 'Kampus Thehok';
        kampusPriority = 1;
      } else if (isKobar) {
        kampusLabel = 'Kampus Kobar';
        kampusPriority = 2;
      }

      const isLaboratorium = isLab(cleanTitle);
      const uniqueKey = `${cleanTitle.toLowerCase()}__${kampusLabel.toLowerCase()}`;

      if (!roomMap.has(uniqueKey)) {
        roomMap.set(uniqueKey, {
          cleanTitle,
          rawNames: new Set([originalName]),
          kampusLabel,
          kampusPriority,
          isLaboratorium,
          typePriority: isLaboratorium ? 1 : 2
        });
      } else {
        roomMap.get(uniqueKey).rawNames.add(originalName);
      }
    };

    // Proses master data ruangan
    if (Array.isArray(allRuanganData)) {
      allRuanganData.forEach(r => {
        const rName = r.nama_ruangan || r.nama;
        processRoom(rName, r.kampus || '');
      });
    }

    // Proses data jadwal
    if (Array.isArray(allJadwal)) {
      allJadwal.forEach(j => {
        processRoom(j.nama_ruangan, j.kampus || '');
      });
    }

    const roomTemp = [];
    roomMap.forEach(r => {
      const tipeLabel = r.isLaboratorium ? 'Laboratorium Komputer' : 'Ruang Perkuliahan Teori';
      const badgeClass = r.isLaboratorium ? 'badge-type-lab' : 'badge-type-ruang';
      const badgeText = r.isLaboratorium ? 'LAB' : 'KELAS';
      const svgIcon = r.isLaboratorium ? svgSearchIcons.lab : svgSearchIcons.ruangan;

      if (!query || r.cleanTitle.toLowerCase().includes(query) || r.kampusLabel.toLowerCase().includes(query) || tipeLabel.toLowerCase().includes(query)) {
        roomTemp.push({
          type: 'ruangan',
          rawValue: r.cleanTitle,
          rawNames: Array.from(r.rawNames),
          badgeClass,
          badgeText,
          svgIcon,
          title: r.cleanTitle,
          subtitle: `${r.kampusLabel} • ${tipeLabel}`,
          kampusPriority: r.kampusPriority,
          typePriority: r.typePriority,
          rawName: r.cleanTitle
        });
      }
    });

    // Urutkan Ruangan: Kampus Thehok dulu baru Kampus Kobar, dan dalam kampus: Laboratorium dulu baru Ruang Kelas
    roomTemp.sort((a, b) => {
      if (a.kampusPriority !== b.kampusPriority) return a.kampusPriority - b.kampusPriority;
      if (a.typePriority !== b.typePriority) return a.typePriority - b.typePriority;
      return a.rawName.localeCompare(b.rawName, undefined, { numeric: true, sensitivity: 'base' });
    });

    roomResults.push(...roomTemp);
  }

  // ==========================================
  // 4. ASISTEN LAB (ASLAB)
  // ==========================================
  if ((cat === 'all' || cat === 'aslab') && typeof globalAslabData !== 'undefined' && Array.isArray(globalAslabData)) {
    globalAslabData.forEach(aslab => {
      if (aslab.nama && (!query || aslab.nama.toLowerCase().includes(query) || (aslab.ruangan && aslab.ruangan.toLowerCase().includes(query)))) {
        aslabResults.push({
          type: 'aslab',
          rawValue: aslab.nama,
          aslabData: aslab,
          badgeClass: 'badge-type-aslab',
          badgeText: 'ASLAB',
          svgIcon: svgSearchIcons.aslab,
          title: aslab.nama,
          subtitle: `Asisten Lab • Jaga di ${aslab.ruangan || '-'} • WA: ${aslab.no_wa || '-'}`
        });
      }
    });
  }

  // Gabungkan hasil pencarian sesuai tab aktif
  let finalResults = [];
  if (cat === 'dosen') finalResults = dosenResults;
  else if (cat === 'mk') finalResults = mkResults;
  else if (cat === 'ruangan') finalResults = roomResults;
  else if (cat === 'aslab') finalResults = aslabResults;
  else {
    finalResults = [...dosenResults, ...mkResults, ...roomResults, ...aslabResults];
  }

  if (finalResults.length === 0) {
    container.innerHTML = `
      <div style="padding: 36px 20px; text-align: center; color: var(--text-muted); font-size: 0.95em;">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.35; margin-bottom:10px;">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <div style="font-weight:600; color:var(--text);">Tidak ada hasil ditemukan</div>
        <div style="font-size:0.85em; margin-top:3px;">Coba gunakan kata kunci nama dosen, mata kuliah, atau ruangan lainnya.</div>
      </div>
    `;
    window._spotlightCurrentResults = [];
    return;
  }

  window._spotlightCurrentResults = finalResults;

  container.innerHTML = finalResults.map((r, i) => `
    <div class="spotlight-item ${i === spotlightActiveIndex ? 'selected' : ''}" onclick="executeSpotlightAction(${i})">
      <div class="spotlight-item-left">
        <div class="spotlight-icon">${r.svgIcon}</div>
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="spotlight-title">${escapeHtml(r.title)}</span>
            <span class="spotlight-badge ${r.badgeClass}">${r.badgeText}</span>
          </div>
          <div class="spotlight-subtitle">${escapeHtml(r.subtitle)}</div>
        </div>
      </div>
      <span style="font-size:0.82em; color:var(--primary); font-weight:700; white-space:nowrap;">Lihat Detail</span>
    </div>
  `).join('');
}

function executeSpotlightAction(idx) {
  if (window._spotlightCurrentResults && window._spotlightCurrentResults[idx]) {
    openSpotlightDetailModal(window._spotlightCurrentResults[idx]);
  }
}

// =========================================================================
// SPOTLIGHT DETAIL PREVIEW MODAL & FILTER APPLICATION
// =========================================================================
function openSpotlightDetailModal(item) {
  const backdrop = document.getElementById('spotlight-detail-backdrop');
  const iconEl = document.getElementById('spotlight-detail-icon');
  const titleEl = document.getElementById('spotlight-detail-title');
  const badgeEl = document.getElementById('spotlight-detail-badge');
  const subEl = document.getElementById('spotlight-detail-subtitle');
  const bodyEl = document.getElementById('spotlight-detail-body');
  const applyBtn = document.getElementById('spotlight-detail-apply-btn');

  if (!backdrop || !item) return;

  titleEl.innerText = item.title;
  badgeEl.className = `spotlight-badge ${item.badgeClass}`;
  badgeEl.innerText = item.badgeText;
  subEl.innerText = item.subtitle;
  iconEl.innerHTML = item.svgIcon;

  let matchingSchedules = [];
  if (Array.isArray(allJadwal)) {
    if (item.type === 'dosen') {
      matchingSchedules = allJadwal.filter(j => j.nama_dosen && j.nama_dosen.toLowerCase().includes(item.rawValue.toLowerCase()));
    } else if (item.type === 'mk') {
      matchingSchedules = allJadwal.filter(j => j.nama_mk && j.nama_mk.toLowerCase().includes(item.rawValue.toLowerCase()));
    } else if (item.type === 'ruangan') {
      matchingSchedules = allJadwal.filter(j => {
        if (!j.nama_ruangan) return false;
        const jRoomLower = j.nama_ruangan.toLowerCase();
        const rawLower = item.rawValue.toLowerCase();
        if (Array.isArray(item.rawNames) && item.rawNames.some(rn => jRoomLower.includes(rn.toLowerCase()))) return true;
        return jRoomLower.includes(rawLower);
      });
    }
  }

  if (item.type === 'aslab') {
    bodyEl.innerHTML = `
      <div class="spotlight-detail-stat-row">
        <div class="spotlight-detail-stat-box">
          <div class="spotlight-detail-stat-val">${item.aslabData.ruangan || '-'}</div>
          <div class="spotlight-detail-stat-lbl">Laboratorium / Ruangan Jaga</div>
        </div>
        <div class="spotlight-detail-stat-box">
          <div class="spotlight-detail-stat-val">${item.aslabData.no_wa ? 'Tersedia' : '-'}</div>
          <div class="spotlight-detail-stat-lbl">Kontak WhatsApp</div>
        </div>
      </div>
      <div style="background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 16px;">
        <div style="font-weight: 600; color: var(--text); margin-bottom: 6px;">Nomor WhatsApp Asisten Lab:</div>
        <div style="font-size: 1.15em; color: var(--primary); font-weight: 700; margin-bottom: 12px;">${item.aslabData.no_wa || 'Belum ada nomor WA terdaftar'}</div>
        ${item.aslabData.no_wa ? `
          <a href="https://wa.me/${item.aslabData.no_wa.replace(/[^0-9]/g, '')}" target="_blank" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:6px; text-decoration:none; padding:8px 16px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            Hubungi via WhatsApp
          </a>
        ` : ''}
      </div>
    `;
    applyBtn.style.display = 'none';
  } else {
    const totalKelas = matchingSchedules.length;
    const uniqueRuangan = [...new Set(matchingSchedules.map(j => j.nama_ruangan).filter(Boolean))].length;

    // Render SEMUA jadwal yang sesuai tanpa potongan/limit
    let scheduleCardsHtml = matchingSchedules.map(s => `
      <div class="spotlight-detail-card-item">
        <div>
          <div style="font-weight: 700; color: var(--text); font-size: 0.95em;">
            ${escapeHtml(s.nama_mk || '-')} ${s.kelas ? `<span style="color:var(--primary); font-size:0.85em; font-weight:700;">(Kelas: ${escapeHtml(s.kelas)})</span>` : ''}
          </div>
          <div style="font-size: 0.82em; color: var(--text-muted); margin-top: 2px;">
            ${escapeHtml(s.nama_ruangan || '-')} • ${escapeHtml(s.hari || '-')}, ${escapeHtml(s.tanggal || '')}
          </div>
        </div>
        <div style="text-align: right; white-space: nowrap;">
          <div style="font-weight: 700; color: var(--primary); font-size: 0.88em;">Pukul ${escapeHtml(s.jam || '-')}</div>
          <span class="badge ${s.metode_pembelajaran === 'TM' ? 'tm' : (s.metode_pembelajaran === 'OL' ? 'ol' : 'cc')}" style="font-size:0.7em;">
            ${escapeHtml(s.metode_pembelajaran || '-')}
          </span>
        </div>
      </div>
    `).join('');

    if (matchingSchedules.length === 0) {
      scheduleCardsHtml = `<div style="text-align:center; color:var(--text-muted); padding:20px;">Tidak ada detail jadwal terkait.</div>`;
    }

    bodyEl.innerHTML = `
      <div class="spotlight-detail-stat-row">
        <div class="spotlight-detail-stat-box">
          <div class="spotlight-detail-stat-val">${totalKelas}</div>
          <div class="spotlight-detail-stat-lbl">Total Sesi Perkuliahan</div>
        </div>
        <div class="spotlight-detail-stat-box">
          <div class="spotlight-detail-stat-val">${uniqueRuangan}</div>
          <div class="spotlight-detail-stat-lbl">Ruangan Terkait</div>
        </div>
      </div>
      <div style="font-weight: 600; font-size: 0.9em; margin-bottom: 8px; color: var(--text);">Daftar Semua Jadwal Terkait (${totalKelas} Sesi):</div>
      <div style="max-height: 380px; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 6px;">
        ${scheduleCardsHtml}
      </div>
    `;

    applyBtn.style.display = 'inline-flex';
    applyBtn.onclick = () => {
      applySpotlightFilterToMainTable(item.type, item.rawValue, matchingSchedules);
    };
  }

  // Tutup spotlight modal sementara & buka detail modal
  const spotlightBackdrop = document.getElementById('spotlight-backdrop');
  if (spotlightBackdrop) spotlightBackdrop.classList.remove('open');
  backdrop.classList.add('open');
}

function backToSpotlightModal() {
  const detailBackdrop = document.getElementById('spotlight-detail-backdrop');
  if (detailBackdrop) detailBackdrop.classList.remove('open');

  const spotlightBackdrop = document.getElementById('spotlight-backdrop');
  if (spotlightBackdrop) {
    spotlightBackdrop.classList.add('open');
    const input = document.getElementById('spotlight-input');
    if (input) input.focus();
  }
}

function closeSpotlightDetailModal(e) {
  if (e && e.target && e.target !== document.getElementById('spotlight-detail-backdrop') && !e.target.closest('.spotlight-btn-clear')) {
    return;
  }
  const backdrop = document.getElementById('spotlight-detail-backdrop');
  if (backdrop) backdrop.classList.remove('open');
}

function applySpotlightFilterToMainTable(type, val, schedules) {
  closeSpotlightDetailModal();

  const filtered = (schedules && schedules.length > 0) ? schedules : allJadwal.filter(j => {
    if (type === 'dosen') return j.nama_dosen === val;
    if (type === 'mk') return j.nama_mk === val;
    if (type === 'ruangan') return j.nama_ruangan === val;
    return true;
  });

  renderTable(filtered);

  const banner = document.getElementById('spotlight-active-banner');
  const bannerText = document.getElementById('spotlight-banner-text');
  if (banner && bannerText) {
    bannerText.innerHTML = `Menampilkan jadwal untuk: <strong>${escapeHtml(val)}</strong> (${filtered.length} jadwal ditemukan)`;
    banner.style.display = 'flex';
  }

  const tableEl = document.getElementById('jadwal-table');
  if (tableEl) {
    tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function resetSpotlightFilter() {
  const banner = document.getElementById('spotlight-active-banner');
  if (banner) banner.style.display = 'none';
  applyFilters();
}


// =========================================================================
// TV / KIOSK DISPLAY MODE (ANIMATED ROLLING QUEUE TICKER & REALTIME TODAY SCRAPER)
// =========================================================================
const TV_VISIBLE_ROWS_COUNT = 7;
let tvClockTimer = null;
let tvAutoRefreshTimer = null;
let tvTickerInterval = null;
let tvAllDayJadwal = [];
let tvCurrentHeadIndex = 0;
let isTvTickerPaused = false;
let isTvAutoSyncing = false;

function getTodayLocalDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTanggalIndo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function openTvMode() {
  const overlay = document.getElementById('tv-mode-overlay');
  if (!overlay) return;

  overlay.classList.add('active');

  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  const selectedDate = document.getElementById('filter-tanggal')?.value;
  const todayStr = getTodayLocalDateStr();
  const targetDate = selectedDate || todayStr;

  if (tvClockTimer) clearInterval(tvClockTimer);
  tvClockTimer = setInterval(updateTvClock, 1000);
  updateTvClock();

  // Setup hover pause
  const container = document.getElementById('tv-grid-container');
  if (container && !container._hoverBound) {
    container.addEventListener('mouseenter', () => { isTvTickerPaused = true; });
    container.addEventListener('mouseleave', () => { isTvTickerPaused = false; });
    container._hoverBound = true;
  }

  // Cek apakah data untuk tanggal tersebut sudah ada di memori allJadwal
  let dayJadwal = (Array.isArray(allJadwal)) ? allJadwal.filter(j => j.tanggal === targetDate) : [];

  // Jika data tanggal hari ini belum ada, otomatis jalankan Realtime Direct Scraper BAAK!
  if (dayJadwal.length === 0 && !isTvAutoSyncing) {
    isTvAutoSyncing = true;
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text); padding: 80px 20px;">
          <div style="margin: 0 auto 20px; width: 46px; height: 46px; border: 4px solid rgba(99, 102, 241, 0.2); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          <div style="font-size: 1.25em; font-weight: 800; color: var(--text);">Menyinkronkan Jadwal Hari Ini Realtime...</div>
          <div style="font-size: 0.9em; margin-top: 6px; color: var(--text-muted);">
            Mengambil data perkuliahan langsung dari BAAK UNAMA untuk tanggal <strong>${escapeHtml(formatTanggalIndo(targetDate))}</strong>.
          </div>
        </div>
      `;
    }

    try {
      await fetch(`${API_BASE_URL}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tanggal: targetDate, from_dashboard: true })
      });
      await fetchAllJadwal();
    } catch (err) {
      console.error("Gagal realtime auto-sync TV mode:", err);
    } finally {
      isTvAutoSyncing = false;
    }
  }

  updateTvModeData(true);

  if (tvAutoRefreshTimer) clearInterval(tvAutoRefreshTimer);
  tvAutoRefreshTimer = setInterval(() => updateTvModeData(false), 30000);
}

function closeTvMode(exitFullscreen = true) {
  const overlay = document.getElementById('tv-mode-overlay');
  if (overlay) overlay.classList.remove('active');

  if (exitFullscreen && document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }

  if (tvClockTimer) { clearInterval(tvClockTimer); tvClockTimer = null; }
  if (tvAutoRefreshTimer) { clearInterval(tvAutoRefreshTimer); tvAutoRefreshTimer = null; }
  if (tvTickerInterval) { clearInterval(tvTickerInterval); tvTickerInterval = null; }
}

// Listen to fullscreen changes to handle ESC key properly!
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    closeTvMode(false);
  }
});
document.addEventListener('webkitfullscreenchange', () => {
  if (!document.webkitFullscreenElement) {
    closeTvMode(false);
  }
});

function createTvRowHtml(item, isEnter = false) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let isActiveNow = false;
  if (item.jam) {
    const parts = item.jam.split(/[-–—]/).map(p => p.trim());
    if (parts.length === 2) {
      const [sh, sm] = parts[0].split(':').map(Number);
      const [eh, em] = parts[1].split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      if (currentMinutes >= startMin && currentMinutes <= endMin) {
        isActiveNow = true;
      }
    }
  }

  let badgeClass = 'default';
  if (item.metode_pembelajaran === 'TM') badgeClass = 'tm';
  else if (item.metode_pembelajaran === 'OL') badgeClass = 'ol';
  else if (item.metode_pembelajaran === 'CC') badgeClass = 'cc';

  let statusDisplay = item.status_jadwal || (item.metode_pembelajaran === 'OL' ? 'Online' : 'OnSchedule');
  let statusHtml = `<span class="tv-row-status">${escapeHtml(statusDisplay)}</span>`;
  if (isActiveNow) {
    statusHtml = `
      <span class="tv-row-status active-status">
        <span class="tv-pulse-dot" style="background:#10b981; box-shadow:0 0 8px #10b981;"></span>
        Sedang Berlangsung
      </span>
    `;
  }

  return `
    <div class="tv-schedule-row ${isActiveNow ? 'active-now' : ''}" ${isEnter ? 'style="animation: popUpFromBottom 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;"' : ''}>
      <div class="tv-row-waktu">
        <strong>${escapeHtml(item.jam || '-')}</strong>
        <small>${escapeHtml(item.hari || '-')}, ${escapeHtml(item.tanggal_format || item.tanggal || '')}</small>
      </div>
      <div class="tv-row-mk">
        <div>${escapeHtml(item.nama_mk || '-')}</div>
        ${item.kelas ? `<div class="tv-row-kelas">(Kelas: ${escapeHtml(item.kelas)})</div>` : ''}
      </div>
      <div class="tv-row-dosen">
        ${escapeHtml(item.nama_dosen || '-')}
      </div>
      <div class="tv-row-ruangan">
        ${escapeHtml(item.nama_ruangan || '-')}
      </div>
      <div>
        ${statusHtml}
      </div>
      <div class="tv-row-metode">
        <span class="badge ${badgeClass}">${escapeHtml(item.metode_pembelajaran || '-')}</span>
      </div>
    </div>
  `;
}

function updateTvClock() {
  const now = new Date();
  const timeEl = document.getElementById('tv-live-time');
  const dateEl = document.getElementById('tv-live-date');

  if (timeEl) {
    timeEl.innerText = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (dateEl) {
    dateEl.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
}

function updateTvModeData(isInitial = false) {
  const grid = document.getElementById('tv-grid-container');
  if (!grid) return;

  const selectedDate = document.getElementById('filter-tanggal')?.value;
  const todayStr = getTodayLocalDateStr();
  const targetDate = selectedDate || todayStr;

  let dayJadwal = [];
  if (Array.isArray(allJadwal)) {
    dayJadwal = allJadwal.filter(j => j.tanggal === targetDate);
  }

  // Hitung Statistik Status (TM, OL, CC, Total)
  const tmCount = dayJadwal.filter(j => j.metode_pembelajaran === 'TM').length;
  const olCount = dayJadwal.filter(j => j.metode_pembelajaran === 'OL').length;
  const ccCount = dayJadwal.filter(j => j.metode_pembelajaran === 'CC').length;
  const totCount = dayJadwal.length;

  const tmEl = document.getElementById('tv-stat-tm');
  const olEl = document.getElementById('tv-stat-ol');
  const ccEl = document.getElementById('tv-stat-cc');
  const totEl = document.getElementById('tv-stat-total');

  if (tmEl) tmEl.innerText = tmCount;
  if (olEl) olEl.innerText = olCount;
  if (ccEl) ccEl.innerText = ccCount;
  if (totEl) totEl.innerText = totCount;

  if (dayJadwal.length === 0) {
    if (tvTickerInterval) { clearInterval(tvTickerInterval); tvTickerInterval = null; }
    tvAllDayJadwal = [];
    grid.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 70px 20px;">
        <svg viewBox="0 0 24 24" width="50" height="50" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 14px; opacity: 0.4;">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <div style="font-size: 1.2em; font-weight: 800; color: var(--text);">Tidak Ada Jadwal Kuliah</div>
        <div style="font-size: 0.92em; margin-top: 6px; color: var(--text-muted);">
          Tidak ada perkuliahan aktif pada tanggal <strong>${escapeHtml(formatTanggalIndo(targetDate))}</strong>.
        </div>
      </div>
    `;
    return;
  }

  // Urutkan jadwal berdasarkan jam mulai
  const sortedJadwal = [...dayJadwal].sort((a, b) => {
    const jamA = (a.jam || '').split(/[-–—]/)[0].trim();
    const jamB = (b.jam || '').split(/[-–—]/)[0].trim();
    return jamA.localeCompare(jamB);
  });

  tvAllDayJadwal = sortedJadwal;

  if (isInitial || grid.children.length === 0) {
    tvCurrentHeadIndex = 0;
    const initialRows = sortedJadwal.slice(0, Math.min(TV_VISIBLE_ROWS_COUNT, sortedJadwal.length));
    grid.innerHTML = initialRows.map((item, idx) => {
      const delay = Math.min(idx * 0.05, 1.0);
      return createTvRowHtml(item).replace('class="tv-schedule-row', `style="animation-delay: ${delay}s;" class="tv-schedule-row`);
    }).join('');
    
    startTvRollingTicker();
  }
}

function startTvRollingTicker() {
  if (tvTickerInterval) clearInterval(tvTickerInterval);

  if (!tvAllDayJadwal || tvAllDayJadwal.length <= TV_VISIBLE_ROWS_COUNT) {
    return;
  }

  tvTickerInterval = setInterval(() => {
    if (isTvTickerPaused) return;

    const container = document.getElementById('tv-grid-container');
    if (!container || tvAllDayJadwal.length <= TV_VISIBLE_ROWS_COUNT) return;

    const firstCard = container.firstElementChild;
    if (!firstCard) return;

    // 1. Tambahkan kelas animasi keluar pada kartu teratas (fade out & slide up)
    firstCard.classList.add('tv-row-exit');

    // 2. Siapkan kartu berikutnya dari antrean jadwal (rolling carousel)
    const nextIndex = (tvCurrentHeadIndex + TV_VISIBLE_ROWS_COUNT) % tvAllDayJadwal.length;
    const nextItem = tvAllDayJadwal[nextIndex];

    const newRowHtml = createTvRowHtml(nextItem, true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newRowHtml.trim();
    const newCardEl = tempDiv.firstElementChild;

    // Tambahkan kartu baru di baris paling bawah
    container.appendChild(newCardEl);

    // Geser index head
    tvCurrentHeadIndex = (tvCurrentHeadIndex + 1) % tvAllDayJadwal.length;

    // 3. Hapus elemen teratas setelah animasi exit selesai (620ms)
    setTimeout(() => {
      if (firstCard && firstCard.parentNode) {
        firstCard.parentNode.removeChild(firstCard);
      }
    }, 620);

  }, 5200); // Bergantian setiap 5.2 detik secara santai & berjiwa
}

// =========================================================================
// EXPOSE TO WINDOW & ATTACH DOM LISTENERS
// =========================================================================
window.openSpotlightModal = openSpotlightModal;
window.closeSpotlightModal = closeSpotlightModal;
window.openSpotlightDetailModal = openSpotlightDetailModal;
window.closeSpotlightDetailModal = closeSpotlightDetailModal;
window.backToSpotlightModal = backToSpotlightModal;
window.clearSpotlightInput = clearSpotlightInput;
window.filterSpotlightCategory = filterSpotlightCategory;
window.resetSpotlightFilter = resetSpotlightFilter;
window.openTvMode = openTvMode;
function closeSettingAndOpenSpotlight() {
  const testModal = document.getElementById('test-wa-modal');
  if (testModal) testModal.classList.remove('open');
  openSpotlightModal();
}

function closeSettingAndOpenTvMode() {
  const testModal = document.getElementById('test-wa-modal');
  if (testModal) testModal.classList.remove('open');
  openTvMode();
}

window.closeSettingAndOpenSpotlight = closeSettingAndOpenSpotlight;
window.closeSettingAndOpenTvMode = closeSettingAndOpenTvMode;
window.resetSpotlightFilter = resetSpotlightFilter;
window.openTvMode = openTvMode;
window.closeTvMode = closeTvMode;
window.exportFilteredSchedulesToExcel = exportFilteredSchedulesToExcel;
window.exportFilteredSchedulesToICS = exportFilteredSchedulesToICS;
window.openSingleGoogleCalendar = openSingleGoogleCalendar;
window.executeSpotlightAction = executeSpotlightAction;

document.addEventListener('DOMContentLoaded', () => {
  const btnSpotlight = document.getElementById('btn-spotlight');
  if (btnSpotlight) {
    btnSpotlight.addEventListener('click', (e) => {
      e.preventDefault();
      openSpotlightModal();
    });
  }

  const btnTv = document.getElementById('btn-tv-mode');
  if (btnTv) {
    btnTv.addEventListener('click', (e) => {
      e.preventDefault();
      openTvMode();
    });
  }

  const btnExpExcel = document.getElementById('btn-export-excel');
  if (btnExpExcel) {
    btnExpExcel.addEventListener('click', (e) => {
      e.preventDefault();
      exportFilteredSchedulesToExcel();
    });
  }

  const btnExpCal = document.getElementById('btn-export-cal');
  if (btnExpCal) {
    btnExpCal.addEventListener('click', (e) => {
      e.preventDefault();
      exportFilteredSchedulesToICS();
    });
  }
});




