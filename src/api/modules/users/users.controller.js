import UsersService from './users.service.js';

export class UsersController {
    async getProfile(req, res, next) {
        try {
            const user = await UsersService.getProfile(req.userId);
            res.json(user);
        } catch (err) {
            next(err);
        }
    }

    async getPublicProfile(req, res, next) {
        try {
            const { userId } = req.params;
            const user = await UsersService.getPublicProfile(parseInt(userId));
            res.json(user);
        } catch (err) {
            next(err);
        }
    }

    async updateProfile(req, res, next) {
        try {
            const user = await UsersService.updateProfile(req.userId, req.body);
            res.json(user);
        } catch (err) {
            next(err);
        }
    }

    async getStats(req, res, next) {
        try {
            const stats = await UsersService.getUserStats(req.userId);
            res.json(stats);
        } catch (err) {
            next(err);
        }
    }
}

export default new UsersController();
