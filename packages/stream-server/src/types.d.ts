declare module 'castv2-client' {
    export class Client {
        connect(options: { host: string; port: number }, callback: (err: Error) => void): void;
        launch(receiver: any, callback: (err: Error, app: any) => void): void;
        join(session: any, receiver: any, callback: (err: Error, app: any) => void): void;
        getSessions(callback: (err: Error, sessions: any[]) => void): void;
        close(): void;
    }
    export class DefaultMediaReceiver { }
}

declare module 'bonjour-service' {
    export default class Bonjour {
        find(options: { type: string }): any;
        destroy(): void;
    }
}
