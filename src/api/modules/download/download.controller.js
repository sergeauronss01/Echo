import downloadService from './download.service.js';

export class DownloadController {
    async batchDownload(req, res, next) {
        try {
            const { queries } = req.body;
            const userId = req.userId || null;
            const results = await downloadService.batchDownloadSongs(queries, userId);
            res.json({ results });
        } catch (err) {
            next(err);
        }
    }

    async addSong(req, res, next) {
        try {
            const { songId } = req.body;
            const userSong = await downloadService.addUserSong(req.userId, songId);
            res.status(201).json(userSong);
        } catch (err) {
            next(err);
        }
    }

    async removeSong(req, res, next) {
        try {
            const { songId } = req.params;
            const result = await downloadService.removeUserSong(req.userId, parseInt(songId));
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getUserSongs(req, res, next) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const result = await downloadService.getUserSongs(req.userId, parseInt(page), parseInt(limit));
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async toggleFavorite(req, res, next) {
        try {
            const { songId } = req.params;
            const { isFavorite } = req.body;
            const userSong = await downloadService.toggleFavorite(req.userId, parseInt(songId), isFavorite);
            res.json(userSong);
        } catch (err) {
            next(err);
        }
    }
}

export default new DownloadController();
