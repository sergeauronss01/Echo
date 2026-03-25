import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

function parseConnectionUrl(connectionUrl) {
    if (!connectionUrl) {
        throw new Error('DATABASE_URL must be set');
    }

    try {
        const url = new URL(connectionUrl);
        return {
            host: url.hostname,
            port: url.port ? parseInt(url.port) : 5432,
            database: url.pathname?.slice(1) || 'postgres',
            user: url.username,
            password: url.password,
            ssl: { rejectUnauthorized: false },
        };
    } catch (err) {
        throw new Error('Invalid DATABASE_URL format. Expected: postgresql://user:password@host:port/database');
    }
}

const config = process.env.DATABASE_URL
    ? parseConnectionUrl(process.env.DATABASE_URL)
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'song_manager',
        user: process.env.DB_USER || 'postgres',
        password: String(process.env.DB_PASSWORD || ""),
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool({
    ...config,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

export async function query(queryText, values = []) {
    const client = await pool.connect();
    try {
        return await client.query(queryText, values);
    } finally {
        client.release();
    }
}

export async function getClient() {
    return await pool.connect();
}

export async function closePool() {
    await pool.end();
}

export default { query, getClient, closePool, pool };
