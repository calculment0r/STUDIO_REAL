// Transport du téléphone : le client commun du serveur de spectacle, déplacé dans @studio-real/protocole (client.ts)
// pour être partagé avec la sortie écran scène. Ce fichier garde les noms d'origine du téléphone (TransportTelephone,
// Horloge) : l'application, l'émulateur et les tests ne changent pas.
export {
  transportWebSocket, transportMemoire, delaiReconnexion, HorlogeServeur as Horloge,
  type EtatLigne, type EtatTransport, type TransportSpectacle as TransportTelephone, type FabriqueHello, type EnvironnementWS,
  type WebSocketMinimal, type OptionsWebSocket, type CoteServeurMemoire, type PaireMemoire, type OptionsMemoire,
} from '@studio-real/protocole';
