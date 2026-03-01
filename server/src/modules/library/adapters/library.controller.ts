import type { Context } from 'hono';
import { addToLibrarySchema, updateProgressSchema, removeFromLibrarySchema } from '@streamer/shared';
import type { LibraryService } from '../domain/library.service.js';

export class LibraryController {
    constructor(private readonly service: LibraryService) { }

    async addToLibrary(c: Context) {
        const body = await c.req.json();
        const data = addToLibrarySchema.parse(body);
        const user = c.get('user') as any;
        const item = await this.service.addToLibrary(user.userId, data);
        return c.json(item, 201);
    }

    async removeFromLibrary(c: Context) {
        const body = await c.req.json();
        const { itemId } = removeFromLibrarySchema.parse(body);
        const user = c.get('user') as any;
        await this.service.removeFromLibrary(user.userId, itemId);
        return new Response(null, { status: 204 });
    }

    async getLibrary(c: Context) {
        const user = c.get('user') as any;
        const items = await this.service.getLibrary(user.userId);
        return c.json({ items });
    }

    async isInLibrary(c: Context) {
        const itemId = c.req.param('itemId');
        const user = c.get('user') as any;
        const inLibrary = await this.service.isInLibrary(user.userId, itemId);
        return c.json({ inLibrary });
    }

    async updateProgress(c: Context) {
        const body = await c.req.json();
        const data = updateProgressSchema.parse(body);
        const user = c.get('user') as any;
        const progress = await this.service.updateProgress(user.userId, data);
        return c.json(progress);
    }

    async getContinueWatching(c: Context) {
        const limitStr = c.req.query('limit');
        const limit = limitStr ? parseInt(limitStr, 10) : 20;
        const user = c.get('user') as any;
        const items = await this.service.getContinueWatching(user.userId, limit);
        return c.json({ items });
    }
}
