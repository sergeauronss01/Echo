import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
    const migrationsDir = path.join(__dirname, '../migrations');

    if (!fs.existsSync(migrationsDir)) {
        console.log('No migrations directory found');
        return;
    }

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    if (files.length === 0) {
        console.log('No migration files found');
        return;
    }

    console.log(`Running ${files.length} migration(s)...`);

    for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        try {
            await query(sql);
            console.log(`✓ Migration ${file} completed`);
        } catch (err) {
            console.error(`✗ Migration ${file} failed:`, err.message);
            throw err;
        }
    }

    console.log('All migrations completed successfully');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runMigrations().then(() => {
        console.log('Migration script finished');
        process.exit(0);
    }).catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}
