-- 1. Create Users Table (With Google ID support)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- Nullable for Google Users
    google_id VARCHAR(255) UNIQUE, -- The new column
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create QR Codes Table
CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id),
    short_slug VARCHAR(10) UNIQUE NOT NULL,
    destination_url TEXT NOT NULL,
    dynamic_rules JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Scan Events Table
CREATE TABLE IF NOT EXISTS scan_events (
    id SERIAL PRIMARY KEY,
    qr_code_id UUID REFERENCES qr_codes(id),
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_type VARCHAR(50),
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
