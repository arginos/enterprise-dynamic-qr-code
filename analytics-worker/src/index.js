const { Pool } = require('pg');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

console.log("Analytics Worker Started... Waiting for events.");

async function processQueue() {
    while (true) {
        try {
            const result = await redis.blpop('scan_events', 0);
            if (result && result[1]) {
                const data = JSON.parse(result[1]);

                // 1. RECORD ANALYTICS
                await pool.query(
                    `INSERT INTO scan_events 
                    (qr_code_id, ip_address, user_agent, device_type, scanned_at) 
                    VALUES ($1, $2, $3, $4, $5)`,
                    [data.qr_id, data.ip, data.user_agent, data.device_type, data.timestamp]
                );
                
                // 2. FIRE WEBHOOK (If URL exists)
                if (data.webhook_url) {
                    console.log(`[Webhook] Firing to ${data.webhook_url}`);
                    fetch(data.webhook_url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'scan',
                            qr_id: data.qr_id,
                            timestamp: data.timestamp,
                            device: data.device_type,
                            ip: data.ip
                        })
                    }).catch(err => console.error(`[Webhook Failed] ${err.message}`));
                }

                console.log(`✅ Processed event for QR: ${data.qr_id}`);
            }
        } catch (err) {
            console.error("Worker Error:", err);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

processQueue();