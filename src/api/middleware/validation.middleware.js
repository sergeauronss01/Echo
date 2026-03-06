import { AppError } from './error.middleware.js';

export function validate(schema, property = 'body') {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[property], {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const messages = error.details.map(d => d.message).join('\n');
            return next(new AppError(`Validation error: ${messages}`, 400));
        }

        Object.assign(req[property], value)
        next();
    };
}

export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
