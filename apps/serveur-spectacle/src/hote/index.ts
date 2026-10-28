// Point d'entrée du serveur de spectacle : `npm run dev:spectacle` (racine) ou `npm start -w @studio-real/serveur-spectacle`
// (node --import tsx src/hote/index.ts). Variables : SPECTACLE_CONFIG (fichier de configuration), PORT, SANS_REPRISE=1.
// Codes de sortie : 0 arrêt propre, 1 exception (instantané et journal écrits), 2 port déjà pris.
import { join } from 'node:path';
import { RACINE, chemin, lireConfig, lireOuCreerSecrets, versionGit } from './config';
import { ErreurPortPris, demarrerServeur, type ServeurSpectacle } from './serveur';

const env = process.env;
let serveur: ServeurSpectacle | null = null;

process.on('uncaughtException', e => {
  console.error('Exception non rattrapée :', e);
  serveur?.urgence(e);
  process.exit(1);
});
process.on('unhandledRejection', e => {
  console.error('Promesse rejetée non traitée :', e);
  serveur?.urgence(e);
  process.exit(1);
});

async function principal() {
  const { config, source } = lireConfig(RACINE, env);
  console.log(`Configuration : ${source}`);
  const fichierSecrets = join(chemin(RACINE, config.exploitation), 'spectacle.secrets.json');
  const { secrets, cree } = lireOuCreerSecrets(fichierSecrets);
  // Jamais la valeur d'un jeton dans la console ni dans le journal : seulement où les trouver.
  console.log(`Jetons par rôle (régie, acteur, agent) ${cree ? 'créés' : 'lus'} dans ${fichierSecrets} (fichier ignoré par git).`);
  try {
    serveur = await demarrerServeur({
      config, racine: RACINE, jetons: secrets.jetons, sansReprise: ['1', 'oui', 'true'].includes(String(env.SANS_REPRISE ?? '').toLowerCase()),
      version: versionGit(RACINE),
    });
  } catch (e) {
    if (e instanceof ErreurPortPris) {
      console.error(`Le port ${e.port} est déjà pris : un autre serveur (ancienne instance ?) tourne déjà. Arrêtez-le, ou lancez avec PORT=<autre port>.`);
      process.exit(2);
    }
    throw e;
  }
  console.log(`PRET : http://localhost:${serveur.port}  (santé : /sante · configuration publique : /config.json · WebSocket : /ws)`);
  let arret = false;
  const arreter = (signal: string) => {
    if (arret) return;
    arret = true;
    console.log(`${signal} : arrêt propre (instantané, journal)…`);
    void serveur!.arreter().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
  };
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) process.on(s, () => arreter(s));
}

void principal();
