# Serveur du prototype P0.5 « figurants »

Un seul processus Node (≥ 20, seule dépendance : `ws`) : pages statiques + WebSocket `/ws` ([PROTOCOLE.md](../PROTOCOLE.md)) + orchestrateur des figurants.

## Lancer

```
cd prototypes/figurants/serveur && npm install
node index.mjs                      # puis http://localhost:8787/ (redirige vers la régie)
node test-bout-en-bout.mjs          # banque sans réseau, puis ollama si OLLAMA_URL répond (ou : banque | ollama)
node mesures.mjs [journal.jsonl]    # p50/p95/p99 par étape et fournisseur, rejets, quasi-doublons
```
Depuis un PC sans Ollama local : `ssh -N -L 11434:localhost:11434 dgx2` dans un autre terminal.

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT`, `HOTE` | `8787`, `0.0.0.0` | écoute HTTP + WS |
| `OLLAMA_URL`, `MODELE_OLLAMA` | `http://localhost:11434`, `qwen3:8b` | fournisseur local |
| `OLLAMA_MODE` | `multi` | `multi` = 1 appel → N répliques ; `parallele` = N appels d'une réplique (gabarits `n2.qwen.*`) |
| `ANTHROPIC_API_KEY` | absente | active Haiku 5.5 (lue dans l'environnement seulement, jamais journalisée) |
| `FOURNISSEUR` | `auto` | `auto` (Haiku › Ollama › banque) · `ollama` · `anthropic` · `banque` |
| `DENSITE`, `ACCELERATION` | `normal`, `2` | densité au démarrage ; accélération de la frappe simulée (1 à 3) |
| `BUDGET_USD`, `MAX_APPELS_MIN` | `5`, `30` | plafonds Anthropic (coût cumulé) et appels LLM par minute |
| `JOURNAUX_DIR`, `BANQUES_DIR` | `serveur/journaux`, `../banques` | journal JSONL du jour ; banques |
| `JETON_REGIE` | absent | si défini, `hello` régie doit porter `jeton` (hors protocole, facultatif) |

## Architecture (en 15 lignes)

1. `index.mjs` : HTTP statique sur la racine du dépôt (anti-traversée, liens symboliques vérifiés, fichiers cachés, `journaux/` et `node_modules/` jamais servis, types MIME), WS `/ws`, boucles `fig.stat` (5 s), rechargement des banques (5 s), santé Ollama (15 s).
2. `jeu.mjs` : mini serveur de jeu. Clients par rôle, état, historique (30 derniers au `welcome`), idempotence `msg` par (rôle:pseudo, `cseq`), **seule porte de diffusion** d'un `chat`, qui refiltre tout texte.
3. Vue par rôle : `regie` reçoit `origine/pid/ref/lat` ; `chat` et `telephone` jamais ; `comedien` reçoit `origine` seulement en marquage `discret`.
4. `moderation.mjs` : normalisation (NFKC, invisibles, homoglyphes, accents, leet, ponctuation, lettres isolées et paires recollées, répétitions), listes mots/expressions/préfixes/`re:` (forme B), URL, e-mails, téléphones, 80 caractères ; règles « figurant » plus strictes (célébrités, urgences, sanctions, vote, IA, chiffres, mentions, format JSON, interdits du segment, pseudos du public présents). Tout rejet est journalisé et compté.
5. `banques.mjs` : lit `../banques/` (schéma de `banques/README.md`), sinon `secours/` fichier par fichier ; `secours/celebrites.txt` toujours chargé pour les figurants.
6. `figurants/orchestrateur.mjs` : densité → débit cible (silence 0, calme 6, normal 20, chaud 45, folie 90 msg/min) et part N0/N1/N2 ; ambiance, rafales N0 sur déclencheurs (plafonnées par énoncé), N1 `debut/libre/mot:/re:/top:/relance/fin`, N2 sur question au chat (détectée dès un partiel de 4 mots) ou fin d'énoncé, souffleur (`dire`, validation → `fig.attente`), main (`msg` + `persona`), vague (clés de `reflexes.json`), chut, relance, COUPE.
7. Choix des personas : poids `reagit[niveau] × activité`, écart minimal entre deux messages, `presence` par segment ; `reagit.N2 = 0` (troll) jamais en N2 et toujours validé en souffleur.
8. `figurants/styliseur.mjs` : voix déterministe (abréviations, fautes typiques/AZERTY, accents, casse, cris, lettres étirées, tics, emojis), retrait des tics d'IA, coupe à 80.
9. `figurants/similarite.mjs` : quasi-doublon (Jaccard trigrammes ≥ 0,5 ou 3 premiers mots, 3 min) ; vagues exemptées.
10. Planificateur : affichage = max(déclencheur + réaction log-normale + frappe à `frappe_cps × accélération` (≈ 36 mots/min mobile) + 0,6 s/emoji − anticipation sur question, texte prêt + 0,1 s) : la frappe masque la latence IA ; péremption 10 s.
11. `figurants/fournisseurs.mjs` : Ollama `/api/chat` (stream, `think:false`, `keep_alive:"30m"`, préfixe système préchauffé à chaque segment) et Anthropic Messages (stream, `thinking` désactivé, `effort low`, `max_tokens` bas, cache du système, coût compté) ; objets JSON extraits au fil du flux ; disjoncteur par fournisseur (3 erreurs / 30 s ou p95 ligne > 4 s → ouvert 60 s) puis repli auto ; sans LLM, la banque répond.
12. COUPE : époque incrémentée, minuteries annulées, appels LLM interrompus, file d'attente vidée ; vérification de l'époque à l'affichage (double garde).
13. `journal.mjs` : `journaux/AAAA-MM-JJ.jsonl`, horodatages `t_asr, t_decision, t_requete, t_premier_jeton, t_ligne, t_filtre, t_pret, t_affiche` par réplique.
14. `mesures.mjs` : rapport à partir d'un journal. `test-bout-en-bout.mjs` : scénario complet avec 4 clients WS.
15. Extensions hors protocole (ignorables) : `etat` (régie, après chaque commande), `fig.cmd {top: id}`, `{chut: false}`, champs en plus dans `fig.stat` et `welcome`.

## Un appel ou N appels pour Ollama ? (mesuré le 26/10, qwen3:8b sur dgx2 via tunnel)

| | 1er jeton p50 / p95 | 1re ligne p50 | 1re réplique N2 affichée après question (p50) | remarque |
|---|---|---|---|---|
| `multi` (retenu) : 1 appel → 3-4 lignes JSON | 386-431 / 436-484 ms | 1,0-1,1 s | 2,6 à 3,2 s (p95 3,8-4,1 s ; n = 3 par essai) | foule plus variée (le modèle voit les autres lignes) |
| `parallele` : 4 appels d'une ligne | 1,3 / 2,5 s | 2,0 s | 3,0 s | Ollama **sérialise** les requêtes : les dernières dépassent le délai de 3 s, le disjoncteur s'ouvre |

## Limites connues
- Rôle régie non authentifié (prototype sur tailnet) ; `JETON_REGIE` en option.
- Le fournisseur Anthropic n'a pas été exercé (pas de clé sur ce PC) ; ses paramètres suivent `banques/prompts.md` et l'étude §6.8.
- Pas de classifieur local (étage 2 de la modération) : listes et motifs seulement.
