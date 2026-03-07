import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class EnvironmentValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    validate() {
        this.validateRequiredEnvVars();
        this.validatePythonEnvironment();
        this.validateFFmpeg();
        this.validateDownloadDirectory();
        this.validateSecrets();

        if (this.errors.length > 0) {
            console.error('\n❌ ENVIRONMENT VALIDATION FAILED:\n');
            this.errors.forEach((err, i) => {
                console.error(`  ${i + 1}. ${err}`);
            });
            console.error('\n');
            process.exit(1);
        }

        if (this.warnings.length > 0) {
            console.warn('\n⚠️  ENVIRONMENT WARNINGS:\n');
            this.warnings.forEach((warn) => {
                console.warn(`  • ${warn}`);
            });
            console.warn('\n');
        }

        console.log('✓ Environment validation passed');
    }

    validateRequiredEnvVars() {
        const required = [
            'NODE_ENV',
            'PORT',
            'JWT_SECRET',
            'JWT_REFRESH_SECRET',
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'YT_API_KEY',
        ];

        const hasModernDB = !!process.env.DATABASE_URL;
        const hasLegacyDB = !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD);

        if (!hasModernDB && !hasLegacyDB) {
            this.errors.push('Database not configured. Set either DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD');
        }

        for (const envVar of required) {
            if (!process.env[envVar]) {
                this.errors.push(`Missing required environment variable: ${envVar}`);
            }
        }
    }

    validateSecrets() {
        const insecureSecrets = [
            'dev-secret-key',
            'dev-secret-key-12345',
            'dev_secret_key_12345',
            'dev-refresh-secret-key',
            'dev_refresh_secret_12345',
        ];

        if (process.env.NODE_ENV === 'production') {
            if (insecureSecrets.includes(process.env.JWT_SECRET)) {
                this.errors.push('JWT_SECRET must not be a development default in production');
            }
            if (insecureSecrets.includes(process.env.JWT_REFRESH_SECRET)) {
                this.errors.push('JWT_REFRESH_SECRET must not be a development default in production');
            }
        }
    }

    validatePythonEnvironment() {
        try {
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            const version = execFileSync(pythonCmd, ['--version'], { encoding: 'utf8' });
            console.log(`✓ Python available: ${version.trim()}`);

            this.validatePythonPackages(pythonCmd);
        } catch (err) {
            this.errors.push(
                `Python not found or not in PATH. Required for audio processing. Install Python 3.8+ and add to PATH.`
            );
        }
    }

    validatePythonPackages(pythonCmd) {
        const packages = ['yt_dlp', 'librosa', 'soundfile'];
        const missingPackages = [];

        for (const pkg of packages) {
            try {
                execFileSync(pythonCmd, ['-c', `import ${pkg}`], { stdio: 'ignore' });
            } catch {
                missingPackages.push(pkg);
            }
        }

        if (missingPackages.length > 0) {
            this.errors.push(
                `Missing Python packages: ${missingPackages.join(', ')}. Run: pip install -r requirements.txt`
            );
        }
    }

    validateFFmpeg() {
        try {
            const ffmpegCmd = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
            execFileSync(ffmpegCmd, ['-version'], { stdio: 'ignore' });
            console.log('✓ FFmpeg available');
        } catch {
            this.errors.push(
                'FFmpeg not found or not in PATH. Required by yt-dlp for audio extraction. Install FFmpeg and add to PATH.'
            );
        }
    }

    validateDownloadDirectory() {
        try {
            const downloadDir =
                process.env.DOWNLOAD_DIR ||
                path.join(os.homedir(), 'Downloads', 'echo-downloads');

            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
                console.log(`✓ Created download directory: ${downloadDir}`);
            } else {
                fs.accessSync(downloadDir, fs.constants.W_OK);
                console.log(`✓ Download directory writable: ${downloadDir}`);
            }

            process.env.DOWNLOAD_DIR = downloadDir;
        } catch (err) {
            this.errors.push(`Download directory not writable: ${err.message}`);
        }
    }
}

export function validateEnvironment() {
    const validator = new EnvironmentValidator();
    validator.validate();
}
