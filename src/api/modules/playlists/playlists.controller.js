import playlistsService from './playlists.service.js';

export class PlaylistsController {
    async create(req, res, next) {
        try {
            const playlist = await playlistsService.createPlaylist(req.userId, req.body);
            res.status(201).json(playlist);
        } catch (err) {
            next(err);
        }
    }

    async get(req, res, next) {
        try {
            const { playlistId } = req.params;
            const playlist = await playlistsService.getPlaylist(parseInt(playlistId), req.userId);
            res.json(playlist);
        } catch (err) {
            next(err);
        }
    }

    async getUserPlaylists(req, res, next) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const result = await playlistsService.getUserPlaylists(req.userId, parseInt(page), parseInt(limit));
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getPublicPlaylists(req, res, next) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const result = await playlistsService.getPublicPlaylists(parseInt(page), parseInt(limit));
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            const { playlistId } = req.params;
            const playlist = await playlistsService.updatePlaylist(parseInt(playlistId), req.userId, req.body);
            res.json(playlist);
        } catch (err) {
            next(err);
        }
    }

    async delete(req, res, next) {
        try {
            const { playlistId } = req.params;
            const result = await playlistsService.deletePlaylist(parseInt(playlistId), req.userId);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async addSong(req, res, next) {
        try {
            const { playlistId } = req.params;
            const result = await playlistsService.addSongToPlaylist(
                parseInt(playlistId),
                req.userId,
                req.body.songId
            );
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    async removeSong(req, res, next) {
        try {
            const { playlistId, songId } = req.params;
            const result = await playlistsService.removeSongFromPlaylist(
                parseInt(playlistId),
                req.userId,
                parseInt(songId)
            );
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async reorderSong(req, res, next) {
        try {
            const { playlistId, songId } = req.params;
            const result = await playlistsService.reorderSongInPlaylist(
                parseInt(playlistId),
                req.userId,
                parseInt(songId),
                req.body.newPosition
            );
            res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

export default new PlaylistsController();
