import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware.js';
import { query } from '../config/database.js';

export function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return next(new AppError('Missing authorization token', 401));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
        req.userId = decoded.id;
        req.user   = decoded;
        next();
    } catch {
        return next(new AppError('Invalid or expired token', 401));
    }
}

export async function requireAdmin(req, res, next) {
    if (!req.userId) {
        return next(new AppError('Authentication required', 401));
    }

    try {
        const result = await query(
            'SELECT role FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return next(new AppError('User not found', 404));
        }

        if (result.rows[0].role !== 'admin') {
            return next(new AppError('Admin access required', 403));
        }

        next();
    } catch (err) {
        next(err);
    }
}

export function optional(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
            req.userId = decoded.id;
            req.user   = decoded;
        } catch {
        }
    }

    next();
}