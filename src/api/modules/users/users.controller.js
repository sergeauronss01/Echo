import usersService from './users.service.js';

export class UsersController {
    async getProfile(req, res, next) {
        try {
            const user = await usersService.getProfile(req.userId);
            res.json(user);
        } catch (err) {
            next(err);
        }
    }

    async getPublicProfile(req, res, next) {
        try {
            const { userId } = req.params;
            const user = await usersService.getPublicProfile(parseInt(userId));
            res.json(user);
        } catch (err) {
            next(err);
        }
    }

    async updateProfile(req, res, next) {
        try {
            const user = await usersService.updateProfile(req.userId, req.body);
            res.json(user);
        } catch (err) {
            next(err);
        }
    }

    async getStats(req, res, next) {
        try {
            const stats = await usersService.getUserStats(req.userId);
            res.json(stats);
        } catch (err) {
            next(err);
        }
    }
}

export default new UsersController();
