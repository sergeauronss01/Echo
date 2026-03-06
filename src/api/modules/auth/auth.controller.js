import AuthService from './auth.service.js';
import { AppError } from '../../middleware/error.middleware.js';
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback'
);

export class AuthController {
    async register(req, res, next) {
        try {
            const { user, token, refreshToken } = await AuthService.register(req.body);
            res.status(201).json({ user, token, refreshToken });
        } catch (err) {
            next(err);
        }
    }

    async login(req, res, next) {
        try {
            const { email, password } = req.body;
            const { user, token, refreshToken } = await AuthService.login(email, password);
            res.status(200).json({ user, token, refreshToken });
        } catch (err) {
            next(err);
        }
    }

    async refresh(req, res, next) {
        try {
            const { refreshToken } = req.body;
            const result = await AuthService.refreshAccessToken(refreshToken);
            res.status(200).json(result);
        } catch (err) {
            next(err);
        }
    }

    async logout(req, res, next) {
        try {
            res.status(200).json({ message: 'Logged out successfully' });
        } catch (err) {
            next(err);
        }
    }

    getGoogleAuthUrl(req, res, next) {
        try {
            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: ['profile', 'email'],
            });
            res.redirect(authUrl);
        } catch (err) {
            next(err);
        }
    }

    async googleCallback(req, res, next) {
        try {
            const { code } = req.query;

            if (!code) {
                throw new AppError('Authorization code missing', 400);
            }

            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);

            const userinfo = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get();
            const { data: googleData } = userinfo;

            const { user, token, refreshToken } = await AuthService.handleGoogleCallback(googleData);

            const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}?token=${token}&refreshToken=${refreshToken}`;
            res.redirect(redirectUrl);
        } catch (err) {
            next(err);
        }
    }
}

export default new AuthController();
