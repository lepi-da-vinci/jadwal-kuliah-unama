const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = 3000;
const BOT_SECRET = process.env.WA_BOT_SECRET_KEY || 'unama_wa_secret_7f8e9d0a1b2c3d4e5f6a8b9c0d1e2f3a';
let sock;

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
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus karena ter-disconnect, mencoba menghubungkan ulang:', shouldReconnect);
            if (lastDisconnect.error) {
                console.error('Error detail:', lastDisconnect.error);
            }
            
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 2000); // Wait 2s before reconnecting
            } else {
                console.log('Anda telah logout. Silakan hapus folder "baileys_auth_info" dan scan ulang QR code.');
            }
        } else if (connection === 'open') {
            console.log('\n✅ WhatsApp Client is READY!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Menerima pesan masuk dan meneruskannya ke backend Python dengan Secret Token
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        // Abaikan pesan kosong atau pesan yang dikirim oleh bot sendiri
        if (!msg.message || msg.key.fromMe) return;

        try {
            const sender = msg.key.participant || msg.key.remoteJid;
            // Abaikan pesan dari grup
            if (sender.endsWith('@g.us')) return;

            // Ambil isi teks pesan
            const text = msg.message.conversation || 
                         (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';
                         
            if (!text) return;
            
            console.log(`\n[PESAN MASUK] Dari ${sender}: ${text}`);

            // Kirim webhook ke FastAPI Python (coba endpoint docker lalu localhost)
            const webhookUrls = [
                process.env.BACKEND_WEBHOOK_URL,
                'http://backend:8000/api/webhook/wa',
                'http://127.0.0.1:8000/api/webhook/wa'
            ].filter(Boolean);

            for (const url of webhookUrls) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-bot-secret': BOT_SECRET
                        },
                        body: JSON.stringify({ sender: sender, text: text.trim() })
                    });
                    console.log(`[WEBHOOK] Status dikirim ke ${url}: HTTP ${response.status}`);
                    if (response.ok) break;
                } catch (err) {
                    // Fallback ke url berikutnya
                }
            }
        } catch (e) {
            console.error('Webhook error:', e);
        }
    });
}

// Endpoint untuk mengirim pesan (Diproteksi dengan Secret Token)
app.post('/send', async (req, res) => {
    const reqSecret = req.headers['x-bot-secret'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (!reqSecret || reqSecret !== BOT_SECRET) {
        return res.status(401).json({ status: 'error', message: 'Akses ditolak: Bot secret token tidak valid.' });
    }

    let { target, message } = req.body;
    
    if (!target || !message) {
        return res.status(400).json({ status: 'error', message: 'Target dan message diperlukan' });
    }
    
    let jid = target;
    // Jika belum mengandung '@', format sebagai nomor standar
    if (!target.includes('@')) {
        // Hapus karakter non-angka
        target = target.replace(/\D/g, '');
        if (target.startsWith('0')) {
            target = '62' + target.substring(1);
        }
        jid = target + '@s.whatsapp.net';
    }
    
    try {
        await sock.sendMessage(jid, { text: message });
        res.json({ status: 'success', message: 'Pesan berhasil dikirim' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengirim pesan', error: error.toString() });
    }
});

app.listen(PORT, () => {
    console.log(`Server Express sedang bersiap di port ${PORT}...`);
    connectToWhatsApp();
});
