import songsService from './songs.service.js';

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
}

export default new SongsController();
