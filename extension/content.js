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
            console.log("Halaman asli terdeteksi! Mengirim data ke lokal API...");
            
            const htmlContent = document.documentElement.outerHTML;

            fetch('http://127.0.0.1:8000/api/sync-html', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    html: htmlContent,
                    tanggal: tanggal
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log("Sinkronisasi berhasil:", data);
                // Tutup tab setelah sukses sinkronisasi
                window.close();
            })
            .catch(error => {
                console.error("Gagal sinkronisasi ke lokal API:", error);
            });
        } else {
            console.log("Masih di halaman Cloudflare atau loading, menunggu...");
        }

    }, 1000); // Cek setiap 1 detik
}
