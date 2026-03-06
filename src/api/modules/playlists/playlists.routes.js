import express from 'express';
import { authenticate, optional } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validation.middleware.js';
import { playlistValidations } from '../../utils/validators.js';
import playlistsController from './playlists.controller.js';

const router = express.Router();

router.post('/', authenticate, validate(playlistValidations.create), (req, res, next) => playlistsController.create(req, res, next));

router.get('/', authenticate, (req, res, next) => playlistsController.getUserPlaylists(req, res, next));

router.get('/public', optional, (req, res, next) => playlistsController.getPublicPlaylists(req, res, next));

router.get('/:playlistId', optional, (req, res, next) => playlistsController.get(req, res, next));

router.put('/:playlistId', authenticate, validate(playlistValidations.update), (req, res, next) => playlistsController.update(req, res, next));

router.delete('/:playlistId', authenticate, (req, res, next) => playlistsController.delete(req, res, next));

router.post('/:playlistId/songs', authenticate, validate(playlistValidations.addSong), (req, res, next) => playlistsController.addSong(req, res, next));

router.delete('/:playlistId/songs/:songId', authenticate, (req, res, next) => playlistsController.removeSong(req, res, next));

router.put('/:playlistId/songs/:songId/reorder', authenticate, validate(playlistValidations.reorder), (req, res, next) => playlistsController.reorderSong(req, res, next));

export default router;
