const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const UAParser = require('ua-parser-js');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
app.use(express.json());
app.use(cors());

// --- CONFIG ---
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_123';

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
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

// Lead Capture Endpoint
app.post('/api/lead', async (req, res) => {
    const { qr_id, name, email } = req.body;
    try {
        await pool.query('INSERT INTO leads (qr_code_id, name, email) VALUES ($1, $2, $3)', [qr_id, name, email]);
        const result = await pool.query('SELECT destination_url FROM qr_codes WHERE id = $1', [qr_id]);
        res.json({ redirect: result.rows[0].destination_url });
    } catch (err) { console.error(err); res.status(500).json({error: 'Save failed'}); }
});

// Get Leads for a specific QR (For Dashboard)
app.get('/api/leads/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM leads WHERE qr_code_id = $1 ORDER BY submitted_at DESC', 
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).send('Error'); }
});

// Create QR
app.post('/api/qr', authenticateToken, async (req, res) => {
    let { destination, dynamic_rules, color } = req.body; 
    if (!destination.startsWith('http')) destination = `https://${destination}`;
    const slug = Math.random().toString(36).substring(2, 8); 
    if (!dynamic_rules) dynamic_rules = {}; 

    try {
        const newQR = await pool.query(
            `INSERT INTO qr_codes (user_id, short_slug, destination_url, dynamic_rules) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [req.user.id, slug, destination, dynamic_rules]
        );
        res.json({ success: true, slug: slug, short_url: `${process.env.HOST_URL}/${slug}`, data: newQR.rows[0] });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Database error' }); }
});

// Update QR
app.put('/api/qr/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    let { destination, dynamic_rules } = req.body;
    if (destination && !destination.startsWith('http')) destination = `https://${destination}`;

    try {
        const result = await pool.query(
            `UPDATE qr_codes SET destination_url = COALESCE($1, destination_url), dynamic_rules = COALESCE($2, dynamic_rules) 
             WHERE id = $3 AND user_id = $4 RETURNING *`,
            [destination, dynamic_rules, id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Unauthorized' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Update failed' }); }
});

// List Codes
app.get('/api/codes', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM qr_codes WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
        res.json(result.rows);
    } catch (err) { res.status(500).send('Error'); }
});

// Stats
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const totalRes = await pool.query('SELECT COUNT(*) FROM scan_events JOIN qr_codes ON scan_events.qr_code_id = qr_codes.id WHERE qr_codes.user_id = $1', [req.user.id]);
        const timelineRes = await pool.query("SELECT TO_CHAR(scanned_at, 'YYYY-MM-DD') as date, COUNT(*) as count FROM scan_events JOIN qr_codes ON scan_events.qr_code_id = qr_codes.id WHERE qr_codes.user_id = $1 GROUP BY date ORDER BY date ASC LIMIT 30", [req.user.id]);
        res.json({ total: totalRes.rows[0]?.count || 0, timeline: timelineRes.rows });
    } catch (err) { res.status(500).send('Error'); }
});

// --- THE REDIRECT ENGINE (Strict Order of Operations) ---
app.get('/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        const result = await pool.query('SELECT * FROM qr_codes WHERE short_slug = $1 AND is_active = TRUE', [slug]);
        if (result.rows.length === 0) return res.status(404).send('Not Found');

        const qr = result.rows[0];
        const rules = qr.dynamic_rules || {};
        
        // 1. LOGGING (Async - Fire and Forget)
        const ua = new UAParser(req.headers['user-agent']);
        const logData = { qr_id: qr.id, ip: req.ip, user_agent: req.headers['user-agent'], device_type: ua.getDevice().type || 'desktop', timestamp: new Date().toISOString() };
        redis.lpush('scan_events', JSON.stringify(logData));

        // 2. CHECK LEAD CAPTURE (Highest Priority!)
        // This MUST happen before checking iOS/Android rules
        if (rules.lead_capture) {
            console.log(`[${slug}] Serving Lead Form`);
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); width: 90%; max-width: 400px; text-align: center; }
                    input { width: 90%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 6px; }
                    button { width: 100%; padding: 12px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; margin-top: 10px; }
                    h2 { color: #1e293b; }
                    p { color: #64748b; font-size: 0.9rem; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Unlock Content</h2>
                    <p>Please enter your details to proceed.</p>
                    <form id="leadForm">
                        <input type="text" id="name" placeholder="Full Name" required>
                        <input type="email" id="email" placeholder="Email Address" required>
                        <button type="submit">Continue</button>
                    </form>
                </div>
                <script>
                    document.getElementById('leadForm').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const name = document.getElementById('name').value;
                        const email = document.getElementById('email').value;
                        
                        const res = await fetch('/api/lead', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ qr_id: '${qr.id}', name, email })
                        });
                        const data = await res.json();
                        if (data.redirect) window.location.href = data.redirect;
                    });
                </script>
            </body>
            </html>
            `;
            return res.send(html); // STOP HERE if lead capture is on
        }

        // 3. SMART ROUTING (Only if Lead Capture is OFF)
        let finalUrl = qr.destination_url;
        const os = ua.getOS().name || 'unknown';

        if (rules.ios && os === 'iOS') {
            console.log(`[${slug}] Routing to iOS URL`);
            finalUrl = rules.ios;
        } else if (rules.android && os === 'Android') {
            console.log(`[${slug}] Routing to Android URL`);
            finalUrl = rules.android;
        }

        // 4. REDIRECT
        console.log(`[${slug}] Redirecting to: ${finalUrl}`);
        res.redirect(302, finalUrl);

    } catch (err) { console.error(err); res.status(500).send('Server Error'); }
});

app.listen(3000, () => console.log('API running on port 3000'));