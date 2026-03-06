import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'song_manager',
    user: process.env.DB_USER || 'postgres',    
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
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
