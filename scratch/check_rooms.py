import sys
sys.path.append('backend')
from wa_notifier import get_db_connection
import scraper

conn = get_db_connection()
c = conn.cursor(dictionary=True)
c.execute('SELECT nama_ruangan, kampus FROM ruangan ORDER BY kampus, nama_ruangan')
rows = c.fetchall()
labs = [f"{r['nama_ruangan']} ({r['kampus']})" for r in rows if scraper.is_lab(r['nama_ruangan'])]
kelas = [f"{r['nama_ruangan']} ({r['kampus']})" for r in rows if not scraper.is_lab(r['nama_ruangan'])]
print(f"LAB ({len(labs)}):", labs[:8])
print(f"KELAS ({len(kelas)}):", kelas[:8])
