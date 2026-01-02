const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const UAParser = require('ua-parser-js');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const multer = require('multer');
const Minio = require('minio');

// --- CRITICAL IMPORTS FOR ADVANCED QR ---
const { JSDOM } = require('jsdom');
const QRCodeStyling = require('qr-code-styling');
const nodeCanvas = require('canvas');

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

// --- HELPER: SERVER SIDE QR GENERATION ---
async function generateHighResQR(data, config) {
    // 1. Configure JSDOM
    const virtualWindow = new JSDOM('', { resources: "usable" }).window;
    
    // 2. SHIM GLOBALS (Critical fix for library compatibility)
    global.window = virtualWindow;
    global.document = virtualWindow.document;
    global.Image = nodeCanvas.Image; 
    
    // 3. Initialize library
    const qr = new QRCodeStyling({
        width: 1000, 
        height: 1000,
        type: 'node', 
        data: data,
        image: config.image || '',
        dotsOptions: config.dotsOptions || { color: '#000', type: 'square' },
        cornersSquareOptions: config.cornersSquareOptions || { color: '#000', type: 'square' },
        backgroundOptions: config.backgroundOptions || { color: '#fff' },
        imageOptions: { crossOrigin: 'anonymous', margin: 20 }
    });

    try {
        const buffer = await qr.getRawData('png');
        return buffer;
    } catch (e) {
        console.error("QR Gen Error:", e);
        return null;
    }
}

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

// --- AUTH MIDDLEWARE ---
const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
        return;
    }
    // Allow pass-through for testing if no token provided (optional, usually block here)
    // return res.sendStatus(401);
    next();
};

// --- PASSPORT (GOOGLE) ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'mock_id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock_secret',
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

// 1. UPLOAD ENDPOINT (Fixes mobile access)
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const bucket = process.env.MINIO_BUCKET_ASSETS || 'qr-assets';
    const objectName = `${Date.now()}-${req.file.originalname}`;
    
    try {
        await minioClient.putObject(bucket, objectName, req.file.buffer);
        
        // Dynamically build URL using the actual HOST_URL (IP) so phones can reach it
        const host = process.env.HOST_URL ? process.env.HOST_URL.split(':3000')[0] : 'http://localhost';
        const url = `${host}:9000/${bucket}/${objectName}`;
        
        res.json({ success: true, url: url });
    } catch (err) {
        console.error("MinIO Error:", err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// 2. CREATE QR (Advanced Rendering)
app.post('/api/qr', authenticate, async (req, res) => {
    let { destination, qr_type, file_asset_url, design_config } = req.body; 
    
    if (!destination.startsWith('http')) destination = `https://${destination}`;
    
    const slug = Math.random().toString(36).substring(2, 8); 
    const domain = process.env.HOST_URL || 'http://localhost:3000';
    const shortUrl = formatShortUrl(domain, slug);

    try {
        // A. Generate Static Asset
        let staticImageUrl = null;
        if (design_config) {
            console.log("Generating Advanced QR for:", slug);
            const buffer = await generateHighResQR(shortUrl, design_config);
            if (buffer) {
                const fileName = `qr-static-${slug}.png`;
                const bucket = process.env.MINIO_BUCKET_ASSETS || 'qr-assets';
                await minioClient.putObject(bucket, fileName, buffer);
                staticImageUrl = `http://localhost:9000/${bucket}/${fileName}`; // Uses localhost for internal, but that's okay for now
            }
        }

        // B. Save to DB
        const metaData = { 
            design_config: design_config || {},
            static_image: staticImageUrl,
            color: design_config?.dotsOptions?.color || '#000000'
        };

        const newQR = await pool.query(
            `INSERT INTO qr_codes (user_id, short_slug, destination_url, qr_type, file_asset_url, meta_data) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.user.id || 1, slug, destination, qr_type || 'url', file_asset_url, metaData]
        );

        res.json({ success: true, slug, short_url: shortUrl, data: newQR.rows[0] });
    } catch (err) { 
        console.error("Create Error:", err); 
        res.status(500).json({ error: 'Database/Generation error' }); 
    }
});

// 3. REDIRECT ENGINE
app.get('/:slug', async (req, res) => {
    const { slug } = req.params;
    const cacheKey = getCacheKey(slug);
    try {
        let qr;
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            qr = JSON.parse(cachedData);
        } else {
            const result = await pool.query(`SELECT qr_codes.*, users.custom_domain FROM qr_codes JOIN users ON qr_codes.user_id = users.id WHERE short_slug = $1`, [slug]);
            if (result.rows.length === 0) return res.status(404).send('Not Found');
            qr = result.rows[0];
            await redis.set(cacheKey, JSON.stringify(qr), 'EX', 300);
        }

        // Log Scan
        const ua = new UAParser(req.headers['user-agent']);
        redis.lpush('scan_events', JSON.stringify({ 
            qr_id: qr.id, ip: req.ip, user_agent: req.headers['user-agent'], 
            device_type: ua.getDevice().type || 'desktop', timestamp: new Date().toISOString()
        }));

        // File Redirects
        if (qr.qr_type === 'pdf' || qr.qr_type === 'image') {
            if (qr.file_asset_url) return res.redirect(302, qr.file_asset_url);
        }

        res.redirect(302, qr.destination_url);
    } catch (err) { console.error(err); res.status(500).send('Server Error'); }
});

app.listen(3000, () => console.log('API running on port 3000'));