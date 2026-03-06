import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware.js';

export function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return next(new AppError('Missing authorization token', 401));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
        req.userId = decoded.id;
        req.user = decoded;
        next();
    } catch (err) {
        return next(new AppError('Invalid or expired token', 401));
    }
}

export function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return next(new AppError('Admin access required', 403));
    }
    next();
}

export function optional(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
            req.userId = decoded.id;
            req.user = decoded;
        } catch (err) {
            console.warn('Invalid token provided, continuing as unauthenticated');
        }
    }
    next();
}
