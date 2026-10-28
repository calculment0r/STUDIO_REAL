// Noyau du serveur de spectacle : PUR (ni Node, ni ws), hébergeable dans un Durable Object sans réécriture.
// L'hôte lui passe les messages, les fermetures et le temps ; il renvoie les messages à remettre et le journal.
export * from './types';
export * from './outils';
export * from './projet';
export * from './representation';
