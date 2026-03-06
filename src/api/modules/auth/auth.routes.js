import express from 'express';
import { validate } from '../../middleware/validation.middleware.js';
import { authValidations } from '../../utils/validators.js';
import authController from './auth.controller.js';

const router = express.Router();

router.post('/register', validate(authValidations.register), (req, res, next) => authController.register(req, res, next));

router.post('/login', validate(authValidations.login), (req, res, next) => authController.login(req, res, next));

router.post('/refresh', validate(authValidations.refreshToken), (req, res, next) => authController.refresh(req, res, next));

router.post('/logout', (req, res, next) => authController.logout(req, res, next));

router.get('/google/url', (req, res, next) => authController.getGoogleAuthUrl(req, res, next));

router.get('/google/callback', (req, res, next) => authController.googleCallback(req, res, next));

export default router;
