const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = 3000;
const BOT_SECRET = process.env.WA_BOT_SECRET_KEY || 'unama_wa_secret_7f8e9d0a1b2c3d4e5f6a8b9c0d1e2f3a';
let sock;

// Inisialisasi direktori log terpadu untuk chatbot
function getLogFilePath() {
    const candidates = [
        path.join('/app', 'logs', 'chatbot.log'),
        path.join(__dirname, '..', 'logs', 'chatbot.log'),
        path.join(__dirname, 'logs', 'chatbot.log')
    ];
    for (const p of candidates) {
        const dir = path.dirname(p);
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            return p;
        } catch (e) {
            // Coba kandidat berikutnya
        }
    }
    return path.join(__dirname, 'chatbot.log');
}
const CHATBOT_LOG_FILE = getLogFilePath();

function logChatbot(level, message, component = 'WA-BOT') {
    const now = new Date();
    // Konversi ke zona waktu WIB (UTC+7)
    const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())} ${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())} WIB`;
    const logLine = `[${ts}] [${level.toUpperCase()}] [${component}] ${message}\n`;
    
    console.log(`[${component}] ${level.toUpperCase()}: ${message}`);
    try {
        fs.appendFileSync(CHATBOT_LOG_FILE, logLine, 'utf8');
    } catch (err) {
        // Jangan crash jika ada kendala disk
    }
}

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.ubuntu('Chrome')
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\nScan QR Code ini dengan WhatsApp Anda:');
            qrcode.generate(qr, { small: true });
            logChatbot('WARN', 'QR Code WhatsApp terdeteksi. Silakan scan QR code dengan WhatsApp di HP Anda untuk login.', 'GATEWAY');
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            const errDetail = lastDisconnect.error ? lastDisconnect.error.toString() : 'Unknown';
            logChatbot('WARN', `Koneksi WhatsApp terputus. Mencoba reconnect: ${shouldReconnect}. Error: ${errDetail}`, 'GATEWAY');
            
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 2000); // Wait 2s before reconnecting
            } else {
                logChatbot('ERROR', 'Sesi WhatsApp telah logout. Silakan hapus folder "baileys_auth_info" dan scan ulang QR code.', 'GATEWAY');
            }
        } else if (connection === 'open') {
            const userPhone = sock?.user?.id || 'Unknown';
            logChatbot('SUCCESS', `WhatsApp Client is READY! Berhasil login sebagai: ${userPhone}`, 'GATEWAY');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Menerima pesan masuk dan meneruskannya ke backend Python dengan Secret Token
    sock.ev.on('messages.upsert', async (m) => {
        // Hanya proses notifikasi pesan baru (abaikan sinkronisasi riwayat chat saat reconnect)
        if (m.type && m.type !== 'notify') return;

        const msg = m.messages && m.messages[0];
        if (!msg || !msg.message || msg.key.fromMe) return;

        try {
            // Untuk chat pribadi, remoteJid adalah identitas pengirim utama
            const sender = msg.key.remoteJid;
            // Abaikan pesan dari grup atau status/stories WhatsApp
            if (!sender || sender.endsWith('@g.us') || sender === 'status@broadcast') return;

            // Ambil isi teks pesan
            const text = msg.message.conversation || 
                         (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';
                         
            if (!text || !text.trim()) return;
            
            logChatbot('INFO', `Pesan masuk dari ${sender}: "${text}"`, 'GATEWAY');

            // Kirim webhook ke FastAPI Python (coba endpoint docker lalu localhost)
            const webhookUrls = [
                process.env.BACKEND_WEBHOOK_URL,
                'http://backend:8000/api/webhook/wa',
                'http://127.0.0.1:8000/api/webhook/wa'
            ].filter(Boolean);

            let webhookSuccess = false;
            for (const url of webhookUrls) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-bot-secret': BOT_SECRET
                        },
                        body: JSON.stringify({ sender: sender, text: text.trim() }),
                        signal: AbortSignal.timeout(10000)
                    });
                    if (response.ok) {
                        logChatbot('SUCCESS', `Pesan dari ${sender} berhasil diteruskan ke webhook ${url} (HTTP ${response.status})`, 'GATEWAY');
                        webhookSuccess = true;
                        break;
                    } else {
                        logChatbot('WARN', `Webhook ${url} merespon status bukan 200: HTTP ${response.status}`, 'GATEWAY');
                    }
                } catch (err) {
                    logChatbot('WARN', `Gagal menghubungkan webhook ke ${url}: ${err.message}`, 'GATEWAY');
                }
            }

            if (!webhookSuccess) {
                logChatbot('ERROR', `Gagal meneruskan pesan dari ${sender} ke semua target backend webhook! Pastikan container backend berjalan normal.`, 'GATEWAY');
            }
        } catch (e) {
            logChatbot('ERROR', `Exception pada pemrosesan messages.upsert: ${e.message}`, 'GATEWAY');
        }
    });
}

// Endpoint untuk menampilkan status sedang mengetik (typing indicator)
app.post('/typing', async (req, res) => {
    const reqSecret = req.headers['x-bot-secret'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (!reqSecret || reqSecret !== BOT_SECRET) {
        return res.status(401).json({ status: 'error', message: 'Akses ditolak: Bot secret token tidak valid.' });
    }

    let { target, state } = req.body;
    if (!target) {
        return res.status(400).json({ status: 'error', message: 'Target diperlukan' });
    }

    let jid = target;
    if (!target.includes('@')) {
        target = target.replace(/\D/g, '');
        if (target.startsWith('0')) {
            target = '62' + target.substring(1);
        }
        jid = target + '@s.whatsapp.net';
    }

    try {
        if (sock && sock.sendPresenceUpdate) {
            await sock.sendPresenceUpdate(state || 'composing', jid);
        }
        res.json({ status: 'success', message: 'Status mengetik berhasil diperbarui' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal update status mengetik', error: error.toString() });
    }
});

// Endpoint untuk mengirim pesan (Diproteksi dengan Secret Token)
app.post('/send', async (req, res) => {
    const reqSecret = req.headers['x-bot-secret'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (!reqSecret || reqSecret !== BOT_SECRET) {
        logChatbot('WARN', 'Request /send ditolak: Secret token bot tidak valid.', 'GATEWAY');
        return res.status(401).json({ status: 'error', message: 'Akses ditolak: Bot secret token tidak valid.' });
    }

    let { target, message, typing } = req.body;
    
    if (!target || !message) {
        return res.status(400).json({ status: 'error', message: 'Target dan message diperlukan' });
    }
    
    let jid = target;
    // Jika belum mengandung '@', format sebagai nomor standar atau lid
    if (!target.includes('@')) {
        // Hapus karakter non-angka
        target = target.replace(/\D/g, '');
        if (target.startsWith('0')) {
            target = '62' + target.substring(1);
            jid = target + '@s.whatsapp.net';
        } else if (target.startsWith('62')) {
            jid = target + '@s.whatsapp.net';
        } else if (target.length >= 14) {
            // Identifier WhatsApp LID (misal akun privasi tanpa nomor HP publik)
            jid = target + '@lid';
        } else {
            jid = target + '@s.whatsapp.net';
        }
    }
    
    if (!sock || !sock.user) {
        logChatbot('ERROR', `Gagal kirim pesan ke ${jid}: WhatsApp Client belum login / koneksi terputus!`, 'GATEWAY');
        return res.status(503).json({ status: 'error', message: 'WhatsApp Client belum siap atau terputus.' });
    }

    try {
        // Animasi status sedang mengetik (composing) sebelum pesan terkirim
        if (typing !== false && sock && sock.sendPresenceUpdate) {
            await sock.sendPresenceUpdate('composing', jid);
            // Durasi jeda mengetik yang natural (1.2 detik sampai 2.8 detik)
            const typingDuration = Math.min(Math.max(1200, message.length * 20), 2800);
            await new Promise(resolve => setTimeout(resolve, typingDuration));
            await sock.sendPresenceUpdate('paused', jid);
        }
        await sock.sendMessage(jid, { text: message });
        logChatbot('SUCCESS', `Pesan berhasil dikirim via Baileys ke WhatsApp ${jid} (${message.length} chars)`, 'GATEWAY');
        res.json({ status: 'success', message: 'Pesan berhasil dikirim' });
    } catch (error) {
        logChatbot('ERROR', `Exception saat Baileys sendMessage ke ${jid}: ${error.toString()}`, 'GATEWAY');
        res.status(500).json({ status: 'error', message: 'Gagal mengirim pesan', error: error.toString() });
    }
});

// Endpoint status kesehatan gateway WhatsApp
app.get('/status', (req, res) => {
    const isReady = !!(sock && sock.user);
    res.json({
        status: 'success',
        ready: isReady,
        user: sock?.user || null
    });
});

app.listen(PORT, () => {
    console.log(`Server Express sedang bersiap di port ${PORT}...`);
    connectToWhatsApp();
});
