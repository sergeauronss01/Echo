import express from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validation.middleware.js';
import { historyValidations } from '../../utils/validators.js';
import historyController from './history.controller.js';

const router = express.Router();

router.post('/', authenticate, validate(historyValidations.log), (req, res, next) => historyController.logPlay(req, res, next));

router.get('/', authenticate, (req, res, next) => historyController.getUserHistory(req, res, next));

router.get('/top-songs', authenticate, (req, res, next) => historyController.getTopSongs(req, res, next));

router.get('/recommendations', authenticate, (req, res, next) => historyController.getRecommendations(req, res, next));

router.get('/stats', authenticate, (req, res, next) => historyController.getStats(req, res, next));

export default router;
