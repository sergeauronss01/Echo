import { execFile } from 'child_process';
import { promisify } from 'util';
import { AppError } from '../middleware/error.middleware.js';

const execFileAsync = promisify(execFile);

export class ChromaprintService {
    async generateFingerprint(filePath) {
        try {
            const fpcalcCmd = await this.getFpcalcCommand();

            const { stdout } = await execFileAsync(fpcalcCmd, [filePath], {
                timeout: 30000,
            });

            const lines = stdout.split('\n');
            let fingerprint = null;
            let duration = null;

            for (const line of lines) {
                if (line.startsWith('FINGERPRINT=')) {
                    fingerprint = line.substring('FINGERPRINT='.length);
                } else if (line.startsWith('DURATION=')) {
                    duration = parseInt(line.substring('DURATION='.length));
                }
            }

            if (!fingerprint) {
                throw new Error('No fingerprint generated');
            }

            return {
                fingerprint,
                duration,
                method: 'chromaprint',
            };
        } catch (err) {
            console.error('Chromaprint fingerprinting failed:', err.message);
            throw new AppError(`Chromaprint fingerprinting failed: ${err.message}`, 500);   
        }
    }

    async getFpcalcCommand() {
        const commands = process.platform === 'win32'
            ? ['fpcalc.exe', 'fpcalc']
            : ['fpcalc'];

        for (const cmd of commands) {
            try {
                await execFileAsync(cmd, ['-v'], { timeout: 2000 });
                return cmd;
            } catch {
                continue;
            }
        }

        throw new Error('fpcalc (Chromaprint) not found in PATH. Install chromaprint package.');
    }

    async isFpcalcAvailable() {
        try {
            await this.getFpcalcCommand();
            return true;
        } catch {
            return false;
        }
    }
}

export default new ChromaprintService();
