# @studio-real/agents : les agents IA du spectacle

Des clients du serveur de spectacle (protocole v2, rôle `agent`, voir `packages/protocole/PROTOCOLE.md`). Le serveur leur envoie
des `agent.cmd` numérotées, ils répondent `agent.ack` (`recu`, puis `fait`, `echec` ou `refus` avec un `detail`) et envoient
leurs entrées par `agent.in`. `ClientAgent` (`src/client-agent.ts`) fait cela une fois pour tous : `hello`, accusés, idempotence
sur `n` (le serveur rejoue les commandes non accusées `fait`), `cseq`, reconnexion.

## Lancer les figurants (le chat fictif)

    npm run figurants -- --url ws://localhost:8790/ws --jeton <jeton agent> [--acteur figurants] [--banques echo]
    powershell -NoProfile -File exploitation\lancer-figurants.ps1 [-Banques echo]    # le soir : jeton et port lus, journal, relance

Sans `--url` ou sans jeton, code de sortie 2 ; `--aide` affiche l'usage. Le script lit `exploitation\spectacle.secrets.json`
(`jetons.agent`) et `spectacle.config.json` (port), journalise dans `exploitation\run\figurants.log`, relance l'agent s'il
s'arrête (5 arrêts en 2 min : abandon) et le jeton passe par `SPECTACLE_JETON_AGENT`, jamais par un argument. Aucun jeton dans le dépôt.

| Variable | Effet |
|---|---|
| `SPECTACLE_JETON_AGENT` | jeton du rôle agent (remplace `--jeton`, à préférer) |
| `OLLAMA_URL` (+ `MODELE_OLLAMA`, défaut `qwen3:8b`) | active le niveau N2 par Ollama |
| `ANTHROPIC_API_KEY` | active le niveau N2 par Claude Haiku 5.5 (budget 5 $ par processus) |

Sans l'une ni l'autre, les figurants jouent leurs banques (N0 réflexes, N1 répliques écrites) et `stat.fournisseur` vaut `banque`.
Banques : lues par chemin dans `prototypes/figurants/banques/` (`--banques echo` = le sous-dossier Écho), jamais copiées.

Ce que les figurants reçoivent : `figurants.cmd` `{densite?, humeur?, segment?, dire?: {intention, personas, validation}}` (et,
en plus, `parle`, `relance`, `vague`, `top`, `chut`, `coupe`, `fournisseur`) ; `figurants.valider` `{id, ok, texte?}`.
Ce qu'ils envoient : `say {persona (pseudo), texte, couleur (jeton du thème)}`, jamais plus d'une par seconde ; `stat {niveau,
densite, repliques, fournisseur, erreurs, …}` toutes les 5 s ; `attente {id, pseudo, texte}` (réplique du souffleur à valider) ;
`journal {ligne}`. Le serveur refiltre tout `say` ; l'agent ne garde qu'un garde-fou local (`filtre.ts` : URL, données
personnelles, mention, sujets à ne pas révéler du segment), pas les listes d'interdits du prototype.

## La page ÉCO (ordinateur de Franck)

`apps/telephone/eco.html` (servie sous `/t/eco.html`) : un agent `eco` dans le navigateur, sans React. Elle s'ouvre avec
`/t/eco.html#spectacle=ws://hote:8790/ws&jeton=<jeton agent>&agent=<identifiant ElevenLabs>` (le fragment est effacé de l'adresse).
**L'identifiant de l'agent ElevenLabs n'est pas dans le code** : il vient de l'adresse, ou de `VITE_ELEVENLABS_AGENT_ID` posée
à la construction (`npm run build -w telephone`). Sur `agent.cmd{type:'appel'}`, bouton « Décrocher » (geste obligatoire pour le micro),
puis la conversation avec le SDK `@elevenlabs/client` chargé alors par `import()` depuis esm.sh, version fixée dans
`apps/telephone/src/eco-appel.ts`. Elle envoie `transcript {de: 'eco'|'personne', texte}`, `parle {actif}`, `fin-appel`.

## Reste à faire

- **Transcriptions vers les agents** : le serveur ne transmet pas encore les transcriptions du comédien aux agents ; le code de
  réaction (`Orchestrateur.onAsr` : déclencheurs N0, mots N1, question au chat N2) est porté et testé, pas branché. Pas de canal inventé.
- **Agent `asr`** (Whisper) et **agent `osc`** (machine) : à écrire sur `ClientAgent`.
- L'entrée de `package-lock.json` pour `@studio-real/agents` (pas de `npm install` dans les copies de travail).
- Valider avec la régie le sens de `persona` (pseudo affiché) et le canal `attente` / `journal` (le serveur les journalise seulement).
- Un essai avec une vraie conversation ElevenLabs (micro, identifiant réel) : non fait ici.

Tests : `npx vitest run --project agents` (client, figurants, partie pure de la page ÉCO ; aucun réseau).
