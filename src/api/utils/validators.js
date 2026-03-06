import Joi from 'joi';

export const authValidations = {
    register: Joi.object({
        username: Joi.string().alphanum().min(3).max(30).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(8).required(),
        firstName: Joi.string().max(100),
        lastName: Joi.string().max(100),
    }),

    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required(),
    }),

    googleCallback: Joi.object({
        code: Joi.string().required(),
    }),

    refreshToken: Joi.object({
        refreshToken: Joi.string().required(),
    }),
};

export const userValidations = {
    update: Joi.object({
        firstName: Joi.string().max(100),
        lastName: Joi.string().max(100),
        profilePictureUrl: Joi.string().uri(),
    }),
};

export const songValidations = {
    create: Joi.object({
        youtubeId: Joi.string().required(),
        title: Joi.string().max(512).required(),
        artist: Joi.string().max(512).required(),
        duration: Joi.number().integer(),
        filePath: Joi.string().max(1024),
        album: Joi.string().max(512),
        genre: Joi.string().max(255),
        year: Joi.number().integer().min(1900).max(2100),
    }),

    search: Joi.object({
        q: Joi.string().required(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
    }),
};

export const playlistValidations = {
    create: Joi.object({
        name: Joi.string().max(512).required(),
        description: Joi.string(),
        isPublic: Joi.boolean().default(false),
    }),

    update: Joi.object({
        name: Joi.string().max(512),
        description: Joi.string(),
        isPublic: Joi.boolean(),
        coverArtUrl: Joi.string().uri(),
    }),

    addSong: Joi.object({
        songId: Joi.number().integer().required(),
    }),

    reorder: Joi.object({
        newPosition: Joi.number().integer().min(1).required(),
    }),
};

export const historyValidations = {
    log: Joi.object({
        songId: Joi.number().integer().required(),
        durationPlayed: Joi.number().integer().required(),
        totalDuration: Joi.number().integer().required(),
    }),
};

export const batchDownloadValidations = {
    download: Joi.object({
        queries: Joi.array().items(Joi.string()).required(),
        userId: Joi.number().integer(),
    }),
};
