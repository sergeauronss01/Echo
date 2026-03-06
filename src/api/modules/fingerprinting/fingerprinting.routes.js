import express from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware.js';
import fingerprintingController from './fingerprinting.controller.js';

const router = express.Router();

router.post('/upload', authenticate, (req, res, next) => fingerprintingController.uploadAndIdentify(req, res, next));

router.post('/record', authenticate, (req, res, next) => fingerprintingController.recordAndIdentify(req, res, next));

router.post('/generate/:songId', authenticate, requireAdmin, (req, res, next) => fingerprintingController.generateForSong(req, res, next));

router.post('/batch-generate', authenticate, requireAdmin, (req, res, next) => fingerprintingController.batchGenerate(req, res, next));

router.get('/history', authenticate, (req, res, next) => fingerprintingController.getMatchHistory(req, res, next));

export default router;
