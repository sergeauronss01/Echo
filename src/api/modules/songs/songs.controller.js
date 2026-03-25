import songsService from './songs.service.js';
import fs from 'fs';
import path from 'path';

export class SongsController {
    async create(req, res, next) {
        try {
            const song = await songsService.createSong(req.body);
            res.status(201).json(song);
        } catch (err) {
            next(err);
        }
    }

    async get(req, res, next) {
        try {
            const { songId } = req.params;
            const song = await songsService.getSong(parseInt(songId));
            res.json(song);
        } catch (err) {
            next(err);
        }
    }

    async search(req, res, next) {
        try {
            const { q, page = 1, limit = 20 } = req.query;
            const result = await songsService.searchSongs(q, parseInt(page), parseInt(limit));
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getAll(req, res, next) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const result = await songsService.getAllSongs(parseInt(page), parseInt(limit));
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async stream(req, res, next) {
        try {
            const { songId } = req.params;
            const filePath = await songsService.getSongFilePath(parseInt(songId));

            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;
            const contentType = 'audio/mpeg';

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = end - start + 1;
                const file = fs.createReadStream(filePath, { start, end });

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': contentType,
                });

                file.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': contentType,
                });

                fs.createReadStream(filePath).pipe(res);
            }
        } catch (err) {
            next(err);
        }
    }
}

export default new SongsController();
