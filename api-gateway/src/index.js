const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const UAParser = require('ua-parser-js');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONFIG ---
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_123';
const SAFE_BROWSING_KEY = process.env.GOOGLE_SAFE_BROWSING_KEY || 'YOUR_GOOGLE_API_KEY_HERE'; 
const getCacheKey = (slug) => `qr:${slug}`;

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

// --- HELPER: MALWARE CHECKER (Google Safe Browsing) ---
async function checkUrlSafety(url) {
    if (!SAFE_BROWSING_KEY || SAFE_BROWSING_KEY === 'YOUR_GOOGLE_API_KEY_HERE') {
        // console.warn("Skipping malware check: No API Key provided.");
        return true; 
    }

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
        if (data.matches && data.matches.length > 0) {
            console.log(`[Security Block] Dangerous URL detected: ${url}`);
            return false;
        }
        return true;
    } catch (err) {
        console.error("Safe Browsing API Error:", err);
        return true; 
    }
}

// --- DUAL AUTH MIDDLEWARE ---
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
            const result = await pool.query(`
                SELECT users.id, users.email, users.custom_domain 
                FROM api_keys 
                JOIN users ON api_keys.user_id = users.id 
                WHERE api_keys.key_string = $1`, 
                [apiKey]
            );
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

app.get('/api/keys', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, key_string, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
        const masked = result.rows.map(k => ({...k, key_string: `${k.key_string.substring(0,8)}...`}));
        res.json(masked);
    } catch (err) { res.status(500).send('Error'); }
});

app.post('/api/keys', authenticate, async (req, res) => {
    const { name } = req.body;
    const newKey = 'pk_' + crypto.randomBytes(16).toString('hex'); 
    try {
        await pool.query('INSERT INTO api_keys (user_id, name, key_string) VALUES ($1, $2, $3)', [req.user.id, name || 'Default Key', newKey]);
        res.json({ success: true, key: newKey });
    } catch (err) { res.status(500).send('Error'); }
});

app.delete('/api/keys/:id', authenticate, async (req, res) => {
    try {
        await pool.query('DELETE FROM api_keys WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).send('Error'); }
});

app.put('/api/user/domain', authenticate, async (req, res) => {
    const { domain } = req.body;
    if (domain && !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
        return res.status(400).json({ error: 'Invalid domain format' });
    }
    try {
        await pool.query('UPDATE users SET custom_domain = $1 WHERE id = $2', [domain, req.user.id]);
        res.json({ success: true, domain });
    } catch (err) { 
        if(err.code === '23505') return res.status(400).json({error: 'Domain already taken'});
        res.status(500).json({ error: 'Database error' }); 
    }
});

app.get('/api/user/me', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT email, custom_domain FROM users WHERE id = $1', [req.user.id]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).send('Error'); }
});

// --- CREATE QR (UPDATED FOR COLOR SAVE) ---
app.post('/api/qr', authenticate, async (req, res) => {
    let { destination, dynamic_rules, color, webhook_url } = req.body; 
    if (!destination.startsWith('http')) destination = `https://${destination}`;
    
    // 1. SECURITY CHECK
    const isSafe = await checkUrlSafety(destination);
    if (!isSafe) {
        return res.status(400).json({ error: 'Security Alert: This URL is flagged as unsafe/malware.' });
    }

    const slug = Math.random().toString(36).substring(2, 8); 
    if (!dynamic_rules) dynamic_rules = {}; 

    // 2. PREPARE META DATA
    const metaData = { color: color || '#000000' };

    try {
        const userDomain = req.user.custom_domain || process.env.HOST_URL;
        const shortUrl = formatShortUrl(userDomain, slug);

        const newQR = await pool.query(
            `INSERT INTO qr_codes (user_id, short_slug, destination_url, dynamic_rules, webhook_url, meta_data) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.user.id, slug, destination, dynamic_rules, webhook_url, metaData]
        );
        res.json({ success: true, slug: slug, short_url: shortUrl, data: newQR.rows[0] });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

// --- UPDATE QR ---
app.put('/api/qr/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    let { destination, dynamic_rules, webhook_url } = req.body;
    
    if (destination) {
        if (!destination.startsWith('http')) destination = `https://${destination}`;
        const isSafe = await checkUrlSafety(destination);
        if (!isSafe) {
            return res.status(400).json({ error: 'Security Alert: This URL is flagged as unsafe/malware.' });
        }
    }

    try {
        const result = await pool.query(
            `UPDATE qr_codes SET destination_url = COALESCE($1, destination_url), dynamic_rules = COALESCE($2, dynamic_rules), webhook_url = COALESCE($3, webhook_url) 
             WHERE id = $4 AND user_id = $5 RETURNING *`,
            [destination, dynamic_rules, webhook_url, id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Unauthorized' });
        
        const updatedQR = result.rows[0];
        await redis.del(getCacheKey(updatedQR.short_slug));

        res.json({ success: true, data: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Update failed' }); }
});

// --- GET CODES (UPDATED FOR COLOR RETRIEVAL) ---
app.get('/api/codes', authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT qr_codes.*, users.custom_domain 
            FROM qr_codes 
            JOIN users ON qr_codes.user_id = users.id 
            WHERE qr_codes.user_id = $1 
            ORDER BY qr_codes.created_at DESC`, 
            [req.user.id]
        );
        
        const rows = result.rows.map(row => {
            return { 
                ...row, 
                short_url: formatShortUrl(row.custom_domain, row.short_slug),
                // Extract color from meta_data
                color: row.meta_data?.color || '#ffffff' 
            };
        });

        res.json(rows);
    } catch (err) { res.status(500).send('Error'); }
});

app.get('/api/stats', authenticate, async (req, res) => {
    try {
        const totalRes = await pool.query('SELECT COUNT(*) FROM scan_events JOIN qr_codes ON scan_events.qr_code_id = qr_codes.id WHERE qr_codes.user_id = $1', [req.user.id]);
        const timelineRes = await pool.query("SELECT TO_CHAR(scanned_at, 'YYYY-MM-DD') as date, COUNT(*) as count FROM scan_events JOIN qr_codes ON scan_events.qr_code_id = qr_codes.id WHERE qr_codes.user_id = $1 GROUP BY date ORDER BY date ASC LIMIT 30", [req.user.id]);
        res.json({ total: totalRes.rows[0]?.count || 0, timeline: timelineRes.rows });
    } catch (err) { res.status(500).send('Error'); }
});

// --- PUBLIC REDIRECT ENGINE ---
app.get('/:slug', async (req, res) => {
    const { slug } = req.params;
    const cacheKey = getCacheKey(slug);
    const host = req.get('host');

    try {
        let qr;
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            qr = JSON.parse(cachedData);
        } else {
            const result = await pool.query(`
                SELECT qr_codes.*, users.custom_domain 
                FROM qr_codes 
                JOIN users ON qr_codes.user_id = users.id 
                WHERE short_slug = $1 AND is_active = TRUE`, 
                [slug]
            );
            if (result.rows.length === 0) return res.status(404).send('Not Found');
            qr = result.rows[0];
            await redis.set(cacheKey, JSON.stringify(qr), 'EX', 300);
        }

        const rules = qr.dynamic_rules || {};
        const ua = new UAParser(req.headers['user-agent']);
        const logData = { 
            qr_id: qr.id, 
            ip: req.ip, 
            user_agent: req.headers['user-agent'], 
            device_type: ua.getDevice().type || 'desktop', 
            timestamp: new Date().toISOString(),
            webhook_url: qr.webhook_url
        };
        redis.lpush('scan_events', JSON.stringify(logData));

        if (rules.lead_capture) {
            // Simplified Lead Capture HTML for brevity in this snippet
            const html = `<!DOCTYPE html><html><body><h2>Please Login</h2><script>...</script></body></html>`; 
            // Note: You might want to keep your full HTML string from the original file here
            const originalHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:white;padding:30px;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);width:90%;max-width:400px;text-align:center}input{width:90%;padding:12px;margin:10px 0;border:1px solid #ddd;border-radius:6px}button{width:100%;padding:12px;background:#2563eb;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;margin-top:10px}h2{color:#1e293b;margin-top:0}p{color:#64748b;font-size:0.9rem;margin-bottom:20px}</style></head><body><div class="card"><h2>Unlock Content</h2><p>Please enter your details to proceed.</p><form id="leadForm"><input type="text" id="name" placeholder="Full Name" required><input type="email" id="email" placeholder="Email Address" required><button type="submit">Continue</button></form></div><script>document.getElementById('leadForm').addEventListener('submit',async(e)=>{e.preventDefault();const name=document.getElementById('name').value;const email=document.getElementById('email').value;const res=await fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({qr_id:'${qr.id}',name,email})});const data=await res.json();if(data.redirect)window.location.href=data.redirect;});</script></body></html>`;
            return res.send(originalHtml);
        }

        let finalUrl = qr.destination_url;
        const os = ua.getOS().name || 'unknown';
        if (rules.ios && os === 'iOS') finalUrl = rules.ios;
        else if (rules.android && os === 'Android') finalUrl = rules.android;

        res.redirect(302, finalUrl);

    } catch (err) { console.error(err); res.status(500).send('Server Error'); }
});

app.post('/api/lead', async (req, res) => {
    const { qr_id, name, email } = req.body;
    try {
        await pool.query('INSERT INTO leads (qr_code_id, name, email) VALUES ($1, $2, $3)', [qr_id, name, email]);
        const result = await pool.query('SELECT destination_url FROM qr_codes WHERE id = $1', [qr_id]);
        res.json({ redirect: result.rows[0].destination_url });
    } catch (err) { console.error(err); res.status(500).json({error: 'Save failed'}); }
});

app.get('/api/leads/:id', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM leads WHERE qr_code_id = $1 ORDER BY submitted_at DESC', [req.params.id]);
        res.json(result.rows);
    } catch (err) { res.status(500).send('Error'); }
});

app.listen(3000, () => console.log('API running on port 3000'));