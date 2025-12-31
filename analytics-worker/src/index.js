const { Pool } = require('pg');
const Redis = require('ioredis');

// Connect to Redis (The Queue) and Postgres (The Storage)
const redis = new Redis(process.env.REDIS_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

console.log("Analytics Worker Started... Waiting for scans.");

async function processQueue() {
    while (true) {
        try {
            // "BLPOP" means "Blocking Left Pop".
            // It waits forever (0) until a new item hits the 'scan_events' list.
            const result = await redis.blpop('scan_events', 0);
            
            // Result comes as [key, value]. We want the value.
            if (result && result[1]) {
                const data = JSON.parse(result[1]);

                // Insert into the database
                await pool.query(
                    `INSERT INTO scan_events 
                    (qr_code_id, ip_address, user_agent, device_type, scanned_at) 
                    VALUES ($1, $2, $3, $4, $5)`,
                    [
                        data.qr_id, 
                        data.ip, 
                        data.user_agent, 
                        data.device_type, 
                        data.timestamp
                    ]
                );
                
                console.log(`✅ Saved scan for QR: ${data.qr_id}`);
            }
        } catch (err) {
            console.error("Worker Error:", err);
            // Wait 5 seconds before retrying if something breaks
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

processQueue();