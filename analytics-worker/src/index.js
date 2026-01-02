const { Pool } = require('pg');
const Redis = require('ioredis');
const geoip = require('geoip-lite');
const Minio = require('minio');
const csv = require('csv-parser');
const QRCode = require('qrcode');
const AdmZip = require('adm-zip');

const redis = new Redis(process.env.REDIS_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY
});

console.log("Worker Started... Listening for events & bulk jobs.");

// --- HELPER: PROCESS BULK JOB ---
async function processBulkJob(job) {
    console.log(`[Bulk] Starting Job ${job.jobId}`);
    try {
        await pool.query('UPDATE bulk_jobs SET status = $1 WHERE id = $2', ['processing', job.jobId]);

        // 1. Get CSV from MinIO
        const csvStream = await minioClient.getObject(job.csvBucket, job.csvKey);
        const rows = [];
        
        await new Promise((resolve, reject) => {
            const parser = csvStream.pipe(csv());
            parser.on('data', (data) => rows.push(data));
            parser.on('end', resolve);
            parser.on('error', reject);
        });

        console.log(`[Bulk] Parsed ${rows.length} rows`);
        const zip = new AdmZip();
        let csvOutput = "Name,Destination,ShortURL,QRCode_Image_File\n";

        // 2. Loop & Generate
        for (const [index, row] of rows.entries()) {
            // Logic A: Template URL / Logic B: Pre-defined
            let destination = "";
            if (job.baseUrl) {
                const params = new URLSearchParams(row).toString();
                destination = `${job.baseUrl}${job.baseUrl.includes('?') ? '&' : '?'}${params}`;
            } else {
                destination = row.url || row.destination || row.link;
            }

            if (!destination) continue; 

            // Create DB Record
            const slug = Math.random().toString(36).substring(2, 8);
            const meta = { color: job.designConfig?.color || '#000000' };
            
            await pool.query(
                `INSERT INTO qr_codes (user_id, short_slug, destination_url, meta_data) VALUES ($1, $2, $3, $4)`,
                [job.userId, slug, destination, meta]
            );

            // Generate Image (Server Side)
            const shortUrl = `${process.env.HOST_URL || 'http://localhost:3000'}/${slug}`;
            const qrBuffer = await QRCode.toBuffer(shortUrl, {
                color: { dark: meta.color, light: '#ffffff' },
                width: 1000 // High res
            });

            const fileName = `qr_${index + 1}_${slug}.png`;
            zip.addFile(fileName, qrBuffer);
            csvOutput += `"${row.name || 'Row ' + index}","${destination}","${shortUrl}","${fileName}"\n`;
        }

        // 3. Save Zip
        zip.addFile("summary.csv", Buffer.from(csvOutput));
        const zipBuffer = zip.toBuffer();
        const zipName = `export-${job.jobId}.zip`;
        const exportBucket = process.env.MINIO_BUCKET_EXPORTS || 'qr-exports';
        
        await minioClient.putObject(exportBucket, zipName, zipBuffer);
        const downloadUrl = `http://localhost:9000/${exportBucket}/${zipName}`; 

        await pool.query(
            'UPDATE bulk_jobs SET status = $1, download_url = $2, processed_rows = $3 WHERE id = $4',
            ['completed', downloadUrl, rows.length, job.jobId]
        );
        console.log(`[Bulk] Job ${job.jobId} Completed`);

    } catch (err) {
        console.error(`[Bulk] Job ${job.jobId} Failed:`, err);
        await pool.query('UPDATE bulk_jobs SET status = $1, error_log = $2 WHERE id = $3', ['failed', err.message, job.jobId]);
    }
}

// --- MAIN LOOP ---
async function start() {
    while (true) {
        // 1. Check Scan Events
        try {
            const scan = await redis.blpop('scan_events', 1);
            if (scan && scan[1]) {
                const data = JSON.parse(scan[1]);
                const geo = geoip.lookup(data.ip);
                await pool.query(
                    `INSERT INTO scan_events (qr_code_id, ip_address, city, country, user_agent, device_type, scanned_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [data.qr_id, data.ip, geo?.city, geo?.country, data.user_agent, data.device_type, data.timestamp]
                );
                
                // Webhook logic
                if (data.webhook_url) {
                    fetch(data.webhook_url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'scan',
                            qr_id: data.qr_id,
                            timestamp: data.timestamp,
                            city: geo?.city,
                            country: geo?.country
                        })
                    }).catch(err => console.error(err));
                }
            }
        } catch (e) {}

        // 2. Check Bulk Jobs
        try {
            const jobStr = await redis.rpop('bulk_jobs');
            if (jobStr) {
                await processBulkJob(JSON.parse(jobStr));
            }
        } catch (e) {}
    }
}

start();