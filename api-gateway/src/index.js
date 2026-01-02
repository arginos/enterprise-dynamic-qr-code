const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const UAParser = require('ua-parser-js');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const multer = require('multer'); // <--- ADDED
const Minio = require('minio');   // <--- ADDED
const QRCode = require('qrcode'); // <--- ADDED

const app = express();
app.use(express.json());
app.use(cors());

// --- CONFIG ---
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_123';
const SAFE_BROWSING_KEY = process.env.GOOGLE_SAFE_BROWSING_KEY || 'YOUR_GOOGLE_API_KEY_HERE'; 
const getCacheKey = (slug) => `qr:${slug}`;

// --- MINIO CONFIG ---
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY
});

// --- UPLOAD MIDDLEWARE ---
const upload = multer({ storage: multer.memoryStorage() });

// --- HELPER: URL FORMATTER ---
const formatShortUrl = (domain, slug) => {
    let final = domain || process.env.HOST_URL || 'localhost:3000';
    if (!final.startsWith('http')) {
        const isLocal = final.includes('localhost') || final.match(/^192\.168\./) || final.match(/^10\./);
        final = (isLocal ? 'http://' : 'https://') + final;
    }
    if (final.endsWith('/')) final = final.slice(0, -1);
    return `${final}/${slug}`;
};

// --- HELPER: MALWARE CHECKER ---
async function checkUrlSafety(url) {
    if (!SAFE_BROWSING_KEY || SAFE_BROWSING_KEY === 'YOUR_GOOGLE_API_KEY_HERE') return true; 
    try {
        const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client: { clientId: "qr-enterprise", clientVersion: "1.0.0" },
                threatInfo: {
                    threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
                    platformTypes: ["ANY_PLATFORM"],
                    threatEntryTypes: ["URL"],
                    threatEntries: [{ url: url }]
                }
            })
        });
        const data = await response.json();
        if (data.matches && data.matches.length > 0) return false;
        return true;
    } catch (err) { return true; }
}

// --- AUTH MIDDLEWARE ---
const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'];

    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
        return;
    }
    if (apiKey) {
        try {
            const result = await pool.query(`SELECT users.id, users.email, users.custom_domain FROM api_keys JOIN users ON api_keys.user_id = users.id WHERE api_keys.key_string = $1`, [apiKey]);
            if (result.rows.length > 0) {
                req.user = result.rows[0];
                return next();
            }
        } catch (err) { console.error(err); }
    }
    return res.sendStatus(401);
};

// --- PASSPORT (GOOGLE) ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const googleId = profile.id;
      let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      let user;
      if (result.rows.length > 0) {
        user = result.rows[0];
        if (!user.google_id) await pool.query('UPDATE users SET google_id = $1 WHERE email = $2', [googleId, email]);
      } else {
        const newUser = await pool.query('INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING *', [email, googleId]);
        user = newUser.rows[0];
      }
      return done(null, user);
    } catch (err) { return done(err, null); }
  }
));

app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/api/auth/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
    const user = req.user;
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.redirect(`${process.env.HOST_URL.replace(':3000', ':8080')}?token=${token}`);
});

// --- API ENDPOINTS ---

// 1. UPLOAD ENDPOINT (Required for PDF/Image QRs)
app.post('/api/upload', authenticate, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const bucket = process.env.MINIO_BUCKET_ASSETS || 'qr-assets';
    const objectName = `${Date.now()}-${req.file.originalname}`;
    try {
        await minioClient.putObject(bucket, objectName, req.file.buffer);
        // We return the LOCALHOST url by default, but this needs to be accessible by your phone
        const url = `http://localhost:9000/${bucket}/${objectName}`;
        res.json({ success: true, url: url });
    } catch (err) {
        console.error("MinIO Error:", err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// 2. PREVIEW ENDPOINT (For the Wizard)
app.post('/api/qr/preview', async (req, res) => {
    const { destination, color } = req.body;
    if (!destination) return res.status(400).send('Missing destination');
    try {
        const buffer = await QRCode.toBuffer(destination, {
            color: { dark: color || '#000000', light: '#ffffff' },
            width: 500, margin: 2
        });
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch(err) { res.status(500).send('Render Error'); }
});

// 3. CREATE QR (Handling Files & Types)
app.post('/api/qr', authenticate, async (req, res) => {
    let { destination, dynamic_rules, color, webhook_url, qr_type, file_asset_url } = req.body; 
    
    // Only check safety if it's a raw URL (not a file upload)
    if ((!qr_type || qr_type === 'url') && destination) {
        if (!destination.startsWith('http')) destination = `https://${destination}`;
        const isSafe = await checkUrlSafety(destination);
        if (!isSafe) return res.status(400).json({ error: 'Security Alert: This URL is flagged as unsafe.' });
    }

    const slug = Math.random().toString(36).substring(2, 8); 
    const metaData = { color: color || '#000000' };

    try {
        const newQR = await pool.query(
            `INSERT INTO qr_codes (user_id, short_slug, destination_url, dynamic_rules, webhook_url, meta_data, qr_type, file_asset_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.user.id, slug, destination, dynamic_rules || {}, webhook_url, metaData, qr_type || 'url', file_asset_url]
        );
        const userDomain = req.user.custom_domain || process.env.HOST_URL;
        const shortUrl = formatShortUrl(userDomain, slug);
        res.json({ success: true, slug: slug, short_url: shortUrl, data: newQR.rows[0] });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

// 4. REDIRECT ENGINE (Handling Files)
app.get('/:slug', async (req, res) => {
    const { slug } = req.params;
    const cacheKey = getCacheKey(slug);
    try {
        let qr;
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            qr = JSON.parse(cachedData);
        } else {
            const result = await pool.query(`SELECT qr_codes.*, users.custom_domain FROM qr_codes JOIN users ON qr_codes.user_id = users.id WHERE short_slug = $1 AND is_active = TRUE`, [slug]);
            if (result.rows.length === 0) return res.status(404).send('Not Found');
            qr = result.rows[0];
            await redis.set(cacheKey, JSON.stringify(qr), 'EX', 300);
        }

        // Log Scan
        const ua = new UAParser(req.headers['user-agent']);
        redis.lpush('scan_events', JSON.stringify({ 
            qr_id: qr.id, ip: req.ip, user_agent: req.headers['user-agent'], 
            device_type: ua.getDevice().type || 'desktop', timestamp: new Date().toISOString(), webhook_url: qr.webhook_url
        }));

        // A. Handle Lead Capture
        if (qr.dynamic_rules?.lead_capture) {
            // (Simplified HTML for brevity)
            const html = `<!DOCTYPE html><html><body><h2>Please Login</h2><script>...</script></body></html>`; 
             const originalHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:white;padding:30px;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);width:90%;max-width:400px;text-align:center}input{width:90%;padding:12px;margin:10px 0;border:1px solid #ddd;border-radius:6px}button{width:100%;padding:12px;background:#2563eb;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;margin-top:10px}h2{color:#1e293b;margin-top:0}p{color:#64748b;font-size:0.9rem;margin-bottom:20px}</style></head><body><div class="card"><h2>Unlock Content</h2><p>Please enter your details to proceed.</p><form id="leadForm"><input type="text" id="name" placeholder="Full Name" required><input type="email" id="email" placeholder="Email Address" required><button type="submit">Continue</button></form></div><script>document.getElementById('leadForm').addEventListener('submit',async(e)=>{e.preventDefault();const name=document.getElementById('name').value;const email=document.getElementById('email').value;const res=await fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({qr_id:'${qr.id}',name,email})});const data=await res.json();if(data.redirect)window.location.href=data.redirect;});</script></body></html>`;
            return res.send(originalHtml);
        }

        // B. Handle File Types (Redirect to MinIO)
        if (qr.qr_type === 'pdf' || qr.qr_type === 'image') {
            if (qr.file_asset_url) return res.redirect(302, qr.file_asset_url);
        }

        // C. Standard URL Redirect
        let finalUrl = qr.destination_url;
        const os = ua.getOS().name || 'unknown';
        if (qr.dynamic_rules?.ios && os === 'iOS') finalUrl = qr.dynamic_rules.ios;
        else if (qr.dynamic_rules?.android && os === 'Android') finalUrl = qr.dynamic_rules.android;

        res.redirect(302, finalUrl);
    } catch (err) { console.error(err); res.status(500).send('Server Error'); }
});

// ... (Rest of existing endpoints: bulk, keys, leads) ...
// (Be sure to keep the bulk endpoints from previous steps if you have them, otherwise ask me to regenerate the FULL file)

app.listen(3000, () => console.log('API running on port 3000'));