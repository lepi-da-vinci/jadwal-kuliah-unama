// Cek apakah halaman ini dibuka oleh dashboard (ada auto_close=1)
const urlParams = new URLSearchParams(window.location.search);
const isAutoClose = urlParams.get('auto_close') === '1';
const tanggal = urlParams.get('tanggal') || '';

if (isAutoClose) {
    console.log("Jadwal Kuliah Sync: Menunggu halaman selesai dimuat sepenuhnya...");

    // Fungsi ini akan terus mengecek apakah tabel jadwal sudah muncul di layar
    // Ini berguna untuk melewati halaman loading Cloudflare ("Just a moment...")
    const checkInterval = setInterval(() => {
        
        // Pastikan kita sudah masuk ke halaman asli, bukan halaman verifikasi keamanan Cloudflare
        const hasScheduleTable = document.querySelector('.table-content') !== null;
        const noDataFound = document.documentElement.outerHTML.includes('Data tidak ditemukan'); // Jika memang hari libur
        
        if (hasScheduleTable || noDataFound) {
            clearInterval(checkInterval); // Berhenti mengecek
            console.log("Halaman siap! Mengirim data ke lokal API...");
            
            // AMBIL DATA HTML SEBELUM MENGUBAH TAMPILAN
            const htmlContent = document.documentElement.outerHTML;
            
            // Tampilkan pesan loading di UI
            document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>⏳ Sedang Menarik Data...</h1><p style='font-size:18px;'>Jangan tutup tab ini. Tab akan tertutup otomatis setelah semua halaman selesai ditarik.</p></div>";
            
            // Parse htmlContent agar aman dari modifikasi DOM
            const parser = new DOMParser();
            const docContext = parser.parseFromString(htmlContent, "text/html");
            
            // Mulai proses rekursif untuk menarik halaman
            processPage(htmlContent, 1, docContext);
        } else {
            console.log("Masih di halaman Cloudflare atau loading, menunggu...");
        }
    }, 1000); // Cek setiap 1 detik
}

function processPage(htmlContent, pageNum, docContext) {
    fetch('http://127.0.0.1:8000/api/sync-html', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            html: htmlContent,
            tanggal: tanggal,
            page: pageNum.toString()
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log(`Sinkronisasi halaman ${pageNum} berhasil:`, data);
        
        // Cari tombol next menggunakan context HTML dokumen (asli atau hasil DOMParser)
        let nextButton = docContext.querySelector('a[rel="next"]');
        let nextHref = nextButton ? nextButton.getAttribute('href') : null;
        
        if (nextHref) {
            console.log(`Ditemukan halaman ${pageNum + 1}! Sedang menarik secara background...`);
            
            // Konversi relative path ke absolute url (karena DOMParser membuat base url about:blank)
            const nextUrl = new URL(nextHref, 'https://baak.unama.ac.id').href;
            
            // Gunakan fetch() background alih-alih berpindah halaman!
            fetch(nextUrl, { credentials: 'include' })
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                    return res.text();
                })
                .then(nextHtml => {
                    console.log(`Berhasil menarik HTML halaman ${pageNum + 1} (${nextHtml.length} karakter).`);
                    const parser = new DOMParser();
                    const nextDoc = parser.parseFromString(nextHtml, "text/html");
                    processPage(nextHtml, pageNum + 1, nextDoc);
                })
                .catch(err => {
                    console.error("Gagal menarik halaman berikutnya secara background:", err);
                    document.body.innerHTML += `<div style="color:red; text-align:center;">Error: ${err.message}</div>`;
                    try { window.close(); } catch (e) {} // Tutup jika error
                });
        } else {
            console.log("Semua halaman selesai! Menutup tab otomatis...");
            // Karena tidak berpindah URL asli, window.close() akan BEKERJA DENGAN SEMPURNA!
            try {
                window.close();
            } catch (e) {
                document.body.innerHTML = "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>✅ Sinkronisasi Selesai!</h1><p style='font-size:18px;'>Semua halaman (termasuk jadwal malam) telah berhasil disinkronisasi.</p><p style='font-size:18px; color:#555;'>Silakan tutup tab ini secara manual.</p></div>";
            }
        }
    })
    .catch(error => {
        console.error("Gagal sinkronisasi ke lokal API:", error);
    });
}
