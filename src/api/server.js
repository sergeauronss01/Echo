import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

dotenv.config({ override: true});

import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import songsRoutes from './modules/songs/songs.routes.js';
import playlistsRoutes from './modules/playlists/playlists.routes.js';
import downloadRoutes from './modules/download/download.routes.js';
import historyRoutes from './modules/history/history.routes.js';
import fingerprintingRoutes from './modules/fingerprinting/fingerprinting.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/* --- Security & Middleware --- */
app.use(helmet());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
});
app.use(limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));

app.use(express.static(path.join(__dirname, '../web')));

/* --- Mount module routes --- */
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/songs', songsRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/fingerprinting', fingerprintingRoutes);

/* --- Health & Root --- */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../web/index.html'));
});

import { runMigrations } from './utils/runMigrations.js';
await runMigrations();

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, async () => {
    try {
        await open(`http://localhost:${PORT}`);
        console.log(`🎵 Song Manager running on http://localhost:${PORT}`);
        console.log(`📡 API available at http://localhost:${PORT}/api`);
        console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    } catch (e) {}
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

export default app;