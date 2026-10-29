// Déclaration minimale du paquet `ws` (le dépôt n'installe pas @types/ws ; pas de dépendance nouvelle) :
// seulement ce que le client des agents en utilise (l'interface à propriétés `on…` du navigateur).
declare module 'ws' {
  export class WebSocket {
    constructor(adresse: string, options?: { maxPayload?: number; handshakeTimeout?: number });
    readonly readyState: number;
    onopen: ((ev: unknown) => void) | null;
    onmessage: ((ev: { data: unknown }) => void) | null;
    onclose: ((ev: unknown) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    send(donnees: string): void;
    close(code?: number, raison?: string): void;
  }
  export default WebSocket;
}
