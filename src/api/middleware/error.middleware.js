export function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    console.error(`[${statusCode}] ${message}`, err);

    res.status(statusCode).json({
        error: true,
        status: statusCode,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}

export function notFoundHandler(req, res) {
    res.status(404).json({
        error: true,
        status: 404,
        message: `Route not found: ${req.method} ${req.path}`,
    });
}

export class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}
