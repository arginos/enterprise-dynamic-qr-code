-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    custom_domain VARCHAR(255)
);

-- 2. Create QR Codes Table (Updated)
CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id),
    short_slug VARCHAR(10) UNIQUE NOT NULL,
    
    -- New Fields for Types & Files
    qr_type VARCHAR(20) DEFAULT 'url', -- 'url', 'pdf', 'image', 'vcard'
    destination_url TEXT NOT NULL,
    file_asset_url TEXT,           -- Stores MinIO URL for PDF/Image QRs
    
    dynamic_rules JSONB,
    meta_data JSONB, 
    webhook_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Scan Events Table (Updated with Geo)
CREATE TABLE IF NOT EXISTS scan_events (
    id SERIAL PRIMARY KEY,
    qr_code_id UUID REFERENCES qr_codes(id),
    ip_address VARCHAR(45),
    city VARCHAR(100),
    country VARCHAR(100),
    user_agent TEXT,
    device_type VARCHAR(50),
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Leads Table
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    qr_code_id UUID REFERENCES qr_codes(id),
    name VARCHAR(255),
    email VARCHAR(255),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(255),
    key_string VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Bulk Jobs Table (New)
CREATE TABLE IF NOT EXISTS bulk_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    download_url TEXT,
    error_log TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);