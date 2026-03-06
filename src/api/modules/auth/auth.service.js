import bcrypt from 'bcrypt';
import { query } from '../../config/database.js';
import { generateToken, generateRefreshToken } from '../../utils/jwt.utils.js';
import { AppError } from '../../middleware/error.middleware.js';

export class AuthService {
    async register(userData) {
        const { username, email, password, firstName, lastName } = userData;

        const existingUser = await query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );

        if (existingUser.rows.length > 0) {
            throw new AppError('Email or username already exists', 409);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await query(
            `INSERT INTO users (username, email, password_hash, first_name, last_name)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, username, email, first_name, last_name, created_at`,
            [username, email, hashedPassword, firstName, lastName]
        );

        const user = result.rows[0];

        const token = generateToken({ id: user.id, email: user.email, username: user.username });
        const refreshToken = generateRefreshToken({ id: user.id });

        return { user, token, refreshToken };
    }

    async login(email, password) {
        const result = await query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            throw new AppError('Invalid email or password', 401);
        }

        const user = result.rows[0];

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            throw new AppError('Invalid email or password', 401);
        }

        await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

        const token = generateToken({ id: user.id, email: user.email, username: user.username });
        const refreshToken = generateRefreshToken({ id: user.id });

        return {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                profilePictureUrl: user.profile_picture_url,
            },
            token,
            refreshToken,
        };
    }

    async refreshAccessToken(refreshToken) {
        let decoded;
        try {
            const { verifyRefreshToken } = await import('../utils/jwt.utils.js');
            decoded = verifyRefreshToken(refreshToken);
        } catch (err) {
            throw new AppError('Invalid refresh token', 401);
        }

        const result = await query('SELECT id, email, username FROM users WHERE id = $1', [decoded.id]);

        if (result.rows.length === 0) {
            throw new AppError('User not found', 404);
        }

        const user = result.rows[0];
        const newToken = generateToken({ id: user.id, email: user.email, username: user.username });
        const newRefreshToken = generateRefreshToken({ id: user.id });

        return { token: newToken, refreshToken: newRefreshToken };
    }

    async handleGoogleCallback(googleData) {
    const { email, name, picture, sub: googleId } = googleData;

    let result = await query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [googleId, email]);

    if (result.rows.length > 0) {
        const user = result.rows[0];

        if (!user.google_id) {
            await query('UPDATE users SET google_id = $1, last_login = NOW() WHERE id = $2', [googleId, user.id]);
        } else {
            await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
        }

        const token = generateToken({ id: user.id, email: user.email, username: user.username });
        const refreshToken = generateRefreshToken({ id: user.id });

        return { user, token, refreshToken };
    }

    const username = email.split('@')[0] + Math.random().toString(36).substr(2, 5);

    result = await query(
        `INSERT INTO users (username, email, google_id, first_name, profile_picture_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, first_name, last_name, profile_picture_url, created_at`,
        [username, email, googleId, name, picture]
    );

    const user = result.rows[0];

    const token = generateToken({ id: user.id, email: user.email, username: user.username });
    const refreshToken = generateRefreshToken({ id: user.id });

    return { user, token, refreshToken };
}
}

export default new AuthService();
