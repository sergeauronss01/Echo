import historyService from './history.service.js';

export class HistoryController {
    async logPlay(req, res, next) {
        try {
            const { songId, durationPlayed, totalDuration } = req.body;
            const play = await historyService.logPlay(req.userId, songId, durationPlayed, totalDuration);
            res.status(201).json(play);
        } catch (err) {
            next(err);
        }
    }

    async getUserHistory(req, res, next) {
        try {
            const { page = 1, limit = 50, startDate, endDate } = req.query;
            const result = await historyService.getUserHistory(
                req.userId,
                parseInt(page),
                parseInt(limit),
                startDate,
                endDate
            );
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getTopSongs(req, res, next) {
        try {
            const { period = 'month', limit = 10 } = req.query;
            const topSongs = await historyService.getTopSongs(req.userId, period, parseInt(limit));
            res.json({ topSongs });
        } catch (err) {
            next(err);
        }
    }

    async getRecommendations(req, res, next) {
        try {
            const { limit = 20 } = req.query;
            const recommendations = await historyService.getRecommendations(req.userId, parseInt(limit));
            res.json({ recommendations });
        } catch (err) {
            next(err);
        }
    }

    async getStats(req, res, next) {
        try {
            const stats = await historyService.getListeningStats(req.userId);
            res.json(stats);
        } catch (err) {
            next(err);
        }
    }
}

export default new HistoryController();
