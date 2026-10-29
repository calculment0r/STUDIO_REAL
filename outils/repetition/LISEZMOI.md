# Répétition technique : 150 faux spectateurs sur le vrai serveur de spectacle
Des téléphones émulés (`packages/emulateur`, la vraie machine du téléphone) se connectent par WebSocket au **vrai** serveur de spectacle, jouent un scénario horodaté (GO, votes, messages, coupures) et mesurent ce que la salle vit. À lancer **avant**
toute représentation, jamais pendant : les GO du scénario font avancer la représentation du serveur visé.

## Lancer

```powershell
# 1. Sans rien préparer : le script démarre son propre serveur (port libre, jetons jetables, projet Écho) puis l'arrête.
npm run repetition -- --scenario outils/repetition/scenario-echo.json                       # 150 téléphones, 5 minutes

# 2. Contre le serveur du spectacle (lancer-spectacle.ps1), sur une NOUVELLE représentation :
.\exploitation\lancer-spectacle.ps1 -Repetition -SansNavigateur -NouvelleRepresentation
npm run repetition -- --scenario outils/repetition/scenario-echo.json --cible ws://localhost:8790/ws --secrets exploitation/spectacle.secrets.json
```

Les jetons sont dans `exploitation/spectacle.secrets.json` (créé au premier lancement, ignoré par git, jamais affiché) :
`--secrets` lit `jetons.public` (téléphones) et `jetons.regie` (GO). Sinon `--jeton` / `--jeton-regie`, ou les variables
`REPETITION_JETON` / `REPETITION_JETON_REGIE`. Autres options : `--telephones`, `--melange`, `--duree`, `--sortie`, `--projet`, `--aide`.
Codes : 0 seuils tenus, 1 seuil dépassé, 2 arguments invalides, 3 répétition impossible.

## Lire le rapport (tableau sur stderr, JSON complet sur stdout ou `--sortie`)

- **Accusés d'affichage** : de l'heure de la vue (serveur) à l'accusé du téléphone, soit « tout le monde voit l'écran en moins
  de 2 s ». Le `p95` est jugé ; « sous 1 s / sous 2 s » donne la part.
- **Connexions** : lignes perdues (coupures du scénario, profils « déconnecté », rechargements), reconnexions réussies ou ratées
  (pas revenue dans les 30 s après la fin de la coupure). **Refus** : un envoi resté en file pendant une coupure puis refusé
  (vote arrivé question fermée) est compté à part : normal.
- **Débit** : messages et octets par seconde, taille des `lecture` reçues par la régie. **Ressources** : CPU et mémoire du
  serveur (seulement s'il est lancé par le script) et du générateur.

## Seuils proposés (champ `seuils` du scénario) et constat

`p95AckMs` 2000 · `refus` 0 · `reconnexionsRatees` 0 ; zéro accusé mesuré est aussi un échec. À durcir après une première
répétition sur le PC de régie. **Constat au 29/10/2026** : le scénario d'Écho complet sort en code 1, car le choix abonne de
`b1_choix` est refusé (`vote-ferme`) à tous les téléphones : défaut du projet converti, pas du générateur (voir le rapport).

## Limite connue

Les 150 connexions partent du **même poste**, sans 4G ni tunnel : on éprouve le serveur et son protocole, pas la salle réelle.
Si le `retard de boucle p99` du générateur dépasse 200 ms, c'est lui le goulot et les latences sont pessimistes.
