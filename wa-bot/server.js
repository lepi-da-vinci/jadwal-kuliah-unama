const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
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

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["WA Bot Unama", "Chrome", "1.0.0"]
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
            
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('Anda telah logout. Silakan hapus folder "baileys_auth_info" dan scan ulang QR code.');
            }
        } else if (connection === 'open') {
            console.log('\n✅ WhatsApp Client is READY!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Endpoint untuk mengirim pesan
app.post('/send', async (req, res) => {
    let { target, message } = req.body;
    
    if (!target || !message) {
        return res.status(400).json({ status: 'error', message: 'Target dan message diperlukan' });
    }
    
    // Hapus karakter non-angka (seperti +, spasi, strip)
    target = target.replace(/\D/g, '');
    
    // Format nomor target (hilangkan awalan 0, tambah 62, plus @s.whatsapp.net)
    if (target.startsWith('0')) {
        target = '62' + target.substring(1);
    }
    
    const jid = target + '@s.whatsapp.net';
    
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
