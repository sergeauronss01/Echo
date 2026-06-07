import express from 'express';
import { optional } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validation.middleware.js';
import { songValidations } from '../../utils/validators.js';
import songsController from './songs.controller.js';

const router = express.Router();

router.post('/', (req, res, next) => songsController.create(req, res, next));

router.get('/', optional, (req, res, next) => songsController.getAll(req, res, next));

router.get('/search', optional, validate(songValidations.search, 'query'), (req, res, next) => songsController.search(req, res, next));

router.get('/:songId/stream-url', optional, (req, res, next) => songsController.getStreamUrl(req, res, next));

router.get('/:songId/stream', optional, (req, res, next) => songsController.stream(req, res, next));

router.get('/:songId', optional, (req, res, next) => songsController.get(req, res, next));

export default router;
