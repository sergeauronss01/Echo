import express from 'express';
import multer from 'multer';
import os from 'os';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware.js';
import fingerprintingController from './fingerprinting.controller.js';

const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream') {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are accepted'), false);
        }
    },
});

const router = express.Router();

// Upload an audio file for identification
router.post(
    '/upload',
    authenticate,
    upload.single('audio'),
    (req, res, next) => fingerprintingController.uploadAndIdentify(req, res, next)
);

router.post(
    '/record',
    authenticate,
    upload.single('audio'),
    (req, res, next) => fingerprintingController.recordAndIdentify(req, res, next)
);

// Admin: generate fingerprint for a specific stored song
router.post(
    '/generate/:songId',
    authenticate,
    requireAdmin,
    (req, res, next) => fingerprintingController.generateForSong(req, res, next)
);

// Admin: batch generate fingerprints
router.post(
    '/batch-generate',
    authenticate,
    requireAdmin,
    (req, res, next) => fingerprintingController.batchGenerate(req, res, next)
);

router.get(
    '/history',
    authenticate,
    (req, res, next) => fingerprintingController.getMatchHistory(req, res, next)
);

export default router;