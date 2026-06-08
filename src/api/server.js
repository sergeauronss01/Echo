import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import { validateEnvironment } from './config/environment.js';

dotenv.config({ override: true});
validateEnvironment();

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
// Disable strict CSP in development so other PCs can load assets smoothly
if (process.env.NODE_ENV == 'production') {
    app.use(
        helmet.contentSecurityPolicy({
            directives: {
                "default-src": ["'self'", "https://outtpsqnptpihgyhznmy.supabase.co"],
                "connect-src": ["'self'", "https://outtpsqnptpihgyhznmy.supabase.co"],
                "media-src": ["'self'", "https://outtpsqnptpihgyhznmy.supabase.co"],
                "img-src": [
                    "'self'", 
                    "data:", 
                    "https://outtpsqnptpihgyhznmy.supabase.co", 
                    "https://*.youtube.com", 
                    "https://*.ytimg.com"
                ],
                "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                "font-src": ["'self'", "https://fonts.gstatic.com"],
                "script-src": ["'self'", "'unsafe-inline'"], // Allowed unsafe-inline for dev flexibility
                "object-src": ["'none'"],
                "upgrade-insecure-requests": [],
            },
            crossOriginEmbedderPolicy: false,
        })
    );
} else {
    app.use(helmet({ 
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    }));
}

// Rate limiting (enabled by default, can be disabled via env)
const isRateLimitDisabled = process.env.DISABLE_RATE_LIMIT === 'true';

const createLimiter = (options) =>
    isRateLimitDisabled ? (req, res, next) => next() : rateLimit(options);

// General API limiter – generous to allow normal continuous use
const generalApiLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many requests, please slow down and try again later.',
    },
});

// Auth-specific limiter – stricter to protect login/register
const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 auth attempts per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many authentication attempts, please try again later.',
    },
});

// Heavy operations limiter – for downloads & fingerprinting
const heavyOpsLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many heavy operations, please slow down and try again later.',
    },
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));

app.use(express.static(path.join(__dirname, '../web')));

/* --- Mount module routes --- */
// Apply rate limits only to API routes (not to static assets or the root page)
if (!isRateLimitDisabled) {
    app.use('/api', generalApiLimiter);
    app.use('/api/auth', authLimiter);
    app.use('/api/download', heavyOpsLimiter);
    app.use('/api/fingerprinting', heavyOpsLimiter);
}

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

app.get('/health/dependencies', (req, res) => {
    const checks = { node: process.version, python: 'unknown', ffmpeg: 'unknown' };

    try {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        checks.python = execFileSync(pythonCmd, ['--version'], { encoding: 'utf8' }).trim();
    } catch {
        checks.python = 'missing or not in PATH';
    }

    try {
        checks.ffmpeg = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' })
            .split('\n')[0].trim();
    } catch {
        checks.ffmpeg = 'missing or not in PATH';
    }

    res.json({ status: 'ok', checks, timestamp: new Date().toISOString() });
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../web/index.html'));
});

import { runMigrations } from './utils/runMigrations.js';
await runMigrations();

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, async () => {
    console.log(`🎵 Song Manager running on http://0.0.0.0:${PORT}`);
    console.log(`📡 API available at http://0.0.0.0:${PORT}/api`);
    console.log(`🏥 Health check: http://0.0.0.0:${PORT}/health`);

    if (process.env.NODE_ENV !== 'production') {
        try {
            await open(`http://localhost:${PORT}`);
        } catch (e) {}
    }
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

export default app;