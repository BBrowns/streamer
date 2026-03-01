import { expect } from 'vitest';
import type { Hono } from 'hono';

export function request(app: Hono | any) {
    return {
        get: (path: string) => new RequestBuilder(app, 'GET', path),
        post: (path: string) => new RequestBuilder(app, 'POST', path),
        put: (path: string) => new RequestBuilder(app, 'PUT', path),
        delete: (path: string) => new RequestBuilder(app, 'DELETE', path),
        patch: (path: string) => new RequestBuilder(app, 'PATCH', path),
    };
}

class RequestBuilder {
    private headers: Record<string, string> = {};
    private _body?: any;

    constructor(private app: Hono | any, private method: string, private path: string) { }

    set(key: string, value: string) {
        this.headers[key] = value;
        return this;
    }

    send(body: any) {
        if (typeof body === 'string') {
            this._body = body;
        } else {
            this._body = JSON.stringify(body);
            if (!this.headers['Content-Type']) {
                this.headers['Content-Type'] = 'application/json';
            }
        }
        return this;
    }

    async execute() {
        const response = await this.app.request(this.path, {
            method: this.method,
            headers: this.headers,
            body: this._body,
        });

        let body;
        try {
            body = await response.json();
        } catch {
            body = await response.text();
        }

        return {
            status: response.status,
            body,
            headers: Object.fromEntries(response.headers.entries()),
        };
    }

    async expect(status: number) {
        const res = await this.execute();
        expect(res.status).toBe(status);
        return res;
    }

    then(resolve: any, reject: any) {
        this.execute().then(resolve).catch(reject);
    }
}
