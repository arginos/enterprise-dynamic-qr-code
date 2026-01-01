-- 1. Create Users Table (With Google ID support)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- Nullable for Google Users
    google_id VARCHAR(255) UNIQUE, -- The new column
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    custom_domain VARCHAR(255) -- Stores "qr.yourbrand.com"
);

-- 2. Create QR Codes Table
CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id),
    short_slug VARCHAR(10) UNIQUE NOT NULL,
    destination_url TEXT NOT NULL,
    dynamic_rules JSONB,
    meta_data JSONB, -- <--- ADDED: Stores color, logo, style prefs
    webhook_url TEXT,
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

-- 4. Create Leads Table
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    qr_code_id UUID REFERENCES qr_codes(id),
    name VARCHAR(255),
    email VARCHAR(255),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. API Keys Table (Ensuring this exists based on your code)
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(255),
    key_string VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);