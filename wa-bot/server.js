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

    // Menerima pesan masuk dan meneruskannya ke backend Python
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        // Abaikan pesan kosong atau pesan yang dikirim oleh bot sendiri
        if (!msg.message || msg.key.fromMe) return;

        try {
            const sender = msg.key.participant || msg.key.remoteJid;
            // Abaikan pesan dari grup
            if (sender.endsWith('@g.us')) return;
            
            console.log("DEBUG MSG KEY:", JSON.stringify(msg.key));
            console.log("DEBUG PARTICIPANT:", msg.key.participant);
            console.log("DEBUG REMOTE JID:", msg.key.remoteJid);

            // Ambil isi teks pesan
            const text = msg.message.conversation || 
                         (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';
                         
            if (!text) return;
            
            console.log(`\n[PESAN MASUK] Dari ${sender}: ${text}`);

            // Kirim webhook ke FastAPI Python
            const response = await fetch('http://127.0.0.1:8000/api/webhook/wa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender: sender, text: text.trim() })
            });
            
            console.log(`[WEBHOOK] Status dikirim ke Backend Python: HTTP ${response.status}`);
        } catch (e) {
            console.error('Webhook error:', e);
        }
    });
}

// Endpoint untuk mengirim pesan
app.post('/send', async (req, res) => {
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
        // Coba kirim langsung tanpa cek onWhatsApp karena onWhatsApp kadang gagal 
        // mengenali nomor yang tidak ada di kontak hp.
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
