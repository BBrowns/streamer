import type { Context } from 'hono';
import { z } from 'zod';
import { addonService } from './addon.service.js';

const installSchema = z.object({
    transportUrl: z.string().url('Must be a valid URL'),
});

export class AddonController {
    async install(c: Context) {
        const body = await c.req.json();
        const { transportUrl } = installSchema.parse(body);
        const user = c.get('user') as any;
        const addon = await addonService.install(user.userId, transportUrl);
        return c.json(addon, 201);
    }

    async list(c: Context) {
        const user = c.get('user') as any;
        const addons = await addonService.list(user.userId);
        return c.json({ addons });
    }

    async uninstall(c: Context) {
        const user = c.get('user') as any;
        const id = c.req.param('id');
        await addonService.uninstall(user.userId, id);
        return new Response(null, { status: 204 });
    }
}

export const addonController = new AddonController();
