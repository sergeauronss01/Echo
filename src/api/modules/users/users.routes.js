import express from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validation.middleware.js';
import { userValidations } from '../../utils/validators.js';
import usersController from './users.controller.js';

const router = express.Router();

router.get('/profile', authenticate, (req, res, next) => usersController.getProfile(req, res, next));

router.put('/profile', authenticate, validate(userValidations.update), (req, res, next) => usersController.updateProfile(req, res, next));

router.get('/stats', authenticate, (req, res, next) => usersController.getStats(req, res, next));

router.get('/:userId', (req, res, next) => usersController.getPublicProfile(req, res, next));

export default router;
