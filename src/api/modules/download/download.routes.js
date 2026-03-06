import express from 'express';
import { authenticate, optional } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validation.middleware.js';
import { batchDownloadValidations } from '../../utils/validators.js';
import downloadController from './download.controller.js';

const router = express.Router();

router.post('/batch', optional, validate(batchDownloadValidations.download), (req, res, next) => downloadController.batchDownload(req, res, next));

router.post('/add-song', authenticate, (req, res, next) => downloadController.addSong(req, res, next));

router.get('/my-songs', authenticate, (req, res, next) => downloadController.getUserSongs(req, res, next));

router.delete('/remove/:songId', authenticate, (req, res, next) => downloadController.removeSong(req, res, next));

router.put('/favorite/:songId', authenticate, (req, res, next) => downloadController.toggleFavorite(req, res, next));

export default router;
