import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureMigrationsTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id         SERIAL PRIMARY KEY,
            filename   VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function getAppliedMigrations() {
    const result = await query('SELECT filename FROM schema_migrations ORDER BY id');
    return new Set(result.rows.map((r) => r.filename));
}

export async function runMigrations() {
    const migrationsDir = path.join(__dirname, '../migrations');

    if (!fs.existsSync(migrationsDir)) {
        console.log('No migrations directory found — skipping.');
        return;
    }

    const files = fs.readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    if (files.length === 0) {
        console.log('No migration files found.');
        return;
    }

    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
        console.log('✓ All migrations already applied.');
        return;
    }

    console.log(`Running ${pending.length} pending migration(s)…`);

    for (const file of pending) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        try {
            await query(sql);
            await query(
                'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
                [file]
            );
            console.log(`  ✓ ${file}`);
        } catch (err) {
            console.error(`  ✗ ${file} failed: ${err.message}`);
            throw err;
        }
    }

    console.log('All migrations completed successfully.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runMigrations()
        .then(() => { console.log('Migration script finished.'); process.exit(0); })
        .catch((err) => { console.error('Migration failed:', err); process.exit(1); });
}