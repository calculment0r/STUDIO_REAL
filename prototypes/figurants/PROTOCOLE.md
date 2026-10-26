# P0.5 Figurants : protocole et découpage

Prototype de la chaîne **voix du comédien → transcription → orchestrateur → répliques des figurants dans le chat**.
L'étude de référence est [docs/etudes/figurants-ia.md](../../docs/etudes/figurants-ia.md), en particulier §6 (génération), §8 (intégration) et §10 (prototype).

## Ce que fait la v0 (et ce qu'elle repousse)

| Brique | v0 (ce prototype) | Plus tard |
|---|---|---|
| Transcription | **Web Speech API** de Chrome sur la page `comedien/` (fr-FR, résultats partiels). C'est gratuit et immédiat, mais l'audio passe par Google. | Voxtral Realtime ou Kyutai sur un DGX, branché sur LiveKit |
| Génération N2 | **Ollama** `qwen3:8b` sur dgx2, avec `think:false` et `keep_alive` (mesuré le 26/10, à chaud : 1er jeton 0,12 s, ligne complète 0,45 s) | Haiku 5.5 si `ANTHROPIC_API_KEY` est défini sur la machine du serveur (jamais dans le dépôt) |
| Serveur | un seul processus Node : pages statiques + WebSocket + orchestrateur, sans serveur de jeu complet | serveur de jeu (Durable Object) + service figurants séparé (protocole `fig.*` de l'étude §8.3) |
| Vrais spectateurs | page `telephone/` : 3 à 5 testeurs écrivent dans le même chat | — |

## Arborescence

```
prototypes/figurants/
  PROTOCOLE.md          ce fichier (contrat entre les parties)
  serveur/              Node ≥ 20, seule dépendance : ws. Lance tout : node serveur/index.mjs
  pages/chat/           le chat affiché (style Twitch) : ce que verrait l'écran scène / le public
  pages/regie/          la mini-régie figurants (étude §8.5)
  pages/comedien/       micro → Web Speech API → événements asr ; affiche le chat selon le mode de marquage
  pages/telephone/      un testeur humain : pseudo + saisie
  banques/              personas.json, reflexes.json (N0), repliques.json (N1), interdits.txt, prompts.md
```

Les pages utilisent le thème : `../../../../design/tokens.css` et `../../../../design/base.css`, sans aucune couleur en dur.
Le serveur sert la racine du dépôt, ce qui rend ces chemins valides. Quand les pages sont ouvertes **sans** serveur, par exemple sur GitHub Pages, elles affichent « serveur non joignable ».

## Lancer (cible)

```
# sur dgx2 (Ollama y tourne) ou sur un PC avec un tunnel : ssh -L 11434:localhost:11434 dgx2
cd STUDIO_REAL/prototypes/figurants/serveur && npm install && node index.mjs
# variables : PORT=8787  OLLAMA_URL=http://localhost:11434  MODELE_OLLAMA=qwen3:8b  ANTHROPIC_API_KEY=(optionnel)
```

Le micro et la Web Speech API exigent un **contexte sécurisé**. On ouvre donc la page comédien soit en `http://localhost:8787` (sur la machine du serveur, ou via un tunnel ssh), soit en HTTPS via `tailscale serve`.

## Messages WebSocket (`/ws`, JSON, champ `t`)

Toutes les heures sont en millisecondes. `ts` est l'heure du serveur (`Date.now()` côté serveur) ; `tc` est l'heure du client.

### Client → serveur
| `t` | Envoyé par | Champs | Sens |
|---|---|---|---|
| `hello` | toutes les pages | `role` (`chat`/`regie`/`comedien`/`telephone`), `pseudo?`, `tc` | identification ; le serveur répond `welcome` |
| `asr` | comedien | `kind` (`partial`/`final`), `texte`, `tc`, `tFinPhrase?` | transcription au fil de l'eau |
| `msg` | telephone, regie (prendre la main) | `cseq` (entier croissant par client), `texte`, `persona?` (si la régie parle à la place d'un persona) | message de chat (idempotent par `cseq`) |
| `fig.cmd` | regie | `cmd` : un objet parmi `{densite: "silence"\|"calme"\|"normal"\|"chaud"\|"folie"}` · `{humeur: {valence: -1..1, energie: 0..1, etiquettes: []}}` · `{dire: {intention, nb: 1..5, validation: bool}}` · `{parle: {persona, texte}}` · `{relance: true}` · `{vague: "😂"}` · `{chut: true}` · `{coupe: bool}` · `{fournisseur: "auto"\|"ollama"\|"anthropic"\|"banque"}` · `{segment: id}` · `{marquage: "masque"\|"discret"}` | commandes de la régie |
| `fig.valide` | regie | `id`, `ok` (bool), `texte?` (version corrigée) | décision sur une réplique en attente |
| `ping` | toutes | `tc` | synchronisation d'horloge ; réponse `pong {tc, ts}` |

### Serveur → client
| `t` | Destinataires | Champs | Sens |
|---|---|---|---|
| `welcome` | l'émetteur | `ts`, `etat` (segment, densité, humeur, marquage, personas actifs), `historique` (30 derniers `chat`) | état initial / reprise |
| `chat` | tous | `id`, `pseudo`, `couleur` (nom de jeton CSS, ex. `--coral-2`), `texte`, `ts` + **pour `regie` seulement** : `origine` (`humain`/`N0`/`N1`/`N2`/`souffleur`/`main`), `pid`, `ref`, `lat` (latences par étape) | une ligne de chat. **L'origine n'est jamais envoyée aux pages `chat` et `telephone`**, et à la page `comedien` seulement si `marquage = "discret"`. |
| `asr` | regie, comedien | `kind`, `texte`, `ts` | écho de la transcription |
| `fig.stat` | regie | `fournisseur`, `lat` `{asr_decision, premier_jeton, ligne, filtre, total}` en p50/p95 sur les 100 dernières, `rejets`, `cout_usd`, `debit` (msg/min réels et figurants), `part_fig` | télémétrie, toutes les 5 s |
| `fig.attente` | regie | `id`, `pid`, `pseudo`, `texte`, `origine` | réplique soumise à validation |
| `journal` | regie | `ts`, `ligne` | journal lisible |
| `pong` | l'émetteur | `tc`, `ts` | — |

## Règles dures (pour toutes les parties)
- **Aucun texte de figurant n'est affiché sans passer par le filtre** (`banques/interdits.txt` + normalisation des accents, du leet et des espacements). Pareil pour les messages humains.
- **Les figurants ne votent pas**, ils ne se font pas passer pour une personne réelle identifiable et n'inventent pas de faits sur de vraies personnes.
- **COUPE** arrête immédiatement toute réplique de figurant, y compris celles déjà planifiées.
- **Aucune clé dans le dépôt.** La clé Anthropic est lue uniquement dans l'environnement du serveur.
- **Tout est journalisé** en JSONL (`serveur/journaux/AAAA-MM-JJ.jsonl`, ignoré par git), avec les horodatages de chaque étape (étude §10.3).
