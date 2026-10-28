// Déclarations minimales du paquet `ws` (le dépôt n'installe pas @types/ws ; pas de dépendance nouvelle) :
// seulement ce que l'hôte et ses tests utilisent.
declare module 'ws' {
  import { EventEmitter } from 'node:events';
  import type { IncomingMessage } from 'node:http';
  import type { Duplex } from 'node:stream';

  export type RawData = Buffer | ArrayBuffer | Buffer[];

  export class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;
    readonly readyState: 0 | 1 | 2 | 3;
    constructor(adresse: string, options?: { maxPayload?: number; handshakeTimeout?: number });
    send(donnees: string, rappel?: (err?: Error) => void): void;
    close(code?: number, raison?: string): void;
    terminate(): void;
    ping(): void;
    on(evt: 'message', f: (donnees: RawData, binaire: boolean) => void): this;
    on(evt: 'close', f: (code: number, raison: Buffer) => void): this;
    on(evt: 'pong', f: () => void): this;
    on(evt: 'open', f: () => void): this;
    on(evt: 'error', f: (err: Error) => void): this;
    once(evt: 'open', f: () => void): this;
    once(evt: 'close', f: (code: number, raison: Buffer) => void): this;
    once(evt: 'error', f: (err: Error) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { noServer?: boolean; maxPayload?: number; perMessageDeflate?: boolean });
    handleUpgrade(req: IncomingMessage, socket: Duplex, tete: Buffer, rappel: (ws: WebSocket, req: IncomingMessage) => void): void;
    close(rappel?: (err?: Error) => void): void;
    readonly clients: Set<WebSocket>;
  }

  export default WebSocket;
}
