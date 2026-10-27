# Étude · 10 blocs indispensables qui manquent au conducteur

Bibliothèque actuelle : 34 blocs du canvas (Quand, Comment, Combien, Qui, Effets téléphone, Écrans du public, Scène et régie, Points d'arrêt) + 8 étapes de base (attente, calage, scène, son, lumière, fondu, liaison, issue). Ce qui manque, trié par urgence pour un spectacle interactif réel. Chaque bloc : pourquoi, entrées / sorties, deux réglages (les rotatifs), aperçu dans le bloc, comportement en cas de problème.

---

## 1. Garde-fou de temps (famille Comment)
**Pourquoi** : aujourd'hui une condition « ≥ 60 % des votes » peut ne jamais être remplie si la salle ne joue pas. Le conducteur signale « bloqué » mais rien ne se passe. En représentation, il faut toujours une sortie de secours datée.
**Entrées / sorties** : 1 entrée · 2 sorties nommées **« condition remplie »** et **« délai dépassé »**.
**Réglages** : délai max (00:05 → 10:00) · comportement à l'échéance (continuer / demander le top).
**Aperçu** : barre de temps qui se remplit en corail, seuil de la condition en vert.
**Si problème** : à l'échéance, sortie « délai dépassé » et note automatique dans la piste Sécurité.

## 2. Mémoire de spectacle (famille Combien)
**Pourquoi** : rien ne se souvient d'un moment à l'autre. Or le théâtre interactif vit de la mémoire : « le public a choisi la fuite à l'acte I, donc la fin change ». Besoin de variables nommées : compteur, drapeau, score, dernier choix.
**Entrées / sorties** : 1 entrée · 1 sortie · lecture possible depuis n'importe quelle condition (« si mémoire.fuite = oui »).
**Réglages** : opération (poser / ajouter / remettre à zéro) · valeur.
**Aperçu** : nom de la mémoire en capitales, valeur en chiffres LCD, historique des 5 dernières valeurs.
**Si problème** : une mémoire non définie vaut 0 / non, jamais une erreur.

## 3. Tirage au sort (famille Comment)
**Pourquoi** : égalité de vote, choix d'un spectateur, ordre aléatoire d'une scène. Le tirage doit être rejouable en répétition (graine fixée) et vraiment aléatoire en représentation.
**Entrées / sorties** : 1 entrée · 2 à 6 sorties pondérées (A 50 %, B 30 %, C 20 %).
**Réglages** : nombre de sorties · mode (graine fixe en répétition / aléa vrai en scène).
**Aperçu** : roue à secteurs colorés, aiguille qui tourne 1,5 s puis s'arrête.
**Si problème** : poids à 0 partout → sortie 1.

## 4. Écoute d'un signal (famille Quand)
**Pourquoi** : la régie reçoit des signaux extérieurs : pédale du comédien, note MIDI de la console, message OSC de QLab, touche d'un clavier régie, capteur de porte. Aujourd'hui seuls les « tops » manuels existent.
**Entrées / sorties** : 1 entrée · 1 sortie « reçu » · option « reçu N fois ».
**Réglages** : source (OSC / MIDI / clavier / GPIO) · adresse ou note (saisie texte + bouton « apprendre » qui capte le prochain signal).
**Aperçu** : oscillogramme plat qui pique à chaque réception, compteur de réceptions.
**Si problème** : signal absent → le bloc reste en attente ; à combiner avec le Garde-fou de temps.

## 5. Commande machine (famille Scène et régie)
**Pourquoi** : envoyer une cue lumière, un GO QLab, une lecture vidéo, un volume. L'asset OSC existe dans le tiroir mais aucun bloc ne l'exécute avec un retour.
**Entrées / sorties** : 1 entrée · 2 sorties **« confirmé »** (accusé de réception machine) et **« sans réponse »** après 2 s.
**Réglages** : cible (console LX / QLab / vidéo / sono) · délai d'attente de l'accusé.
**Aperçu** : ligne de commande mono (`/qlab/cue/12 GO`), pastille verte à l'accusé, rouge sinon.
**Si problème** : sans réponse → bandeau Sécurité « la console lumière ne répond pas » + sortie dédiée.

## 6. Boucle (famille Comment)
**Pourquoi** : « rejouer la vague de lumière 3 fois », « poser la question jusqu'à ce que 80 % aient répondu », « ambiance en boucle tant que le public entre ». Aujourd'hui il faut dupliquer les étapes.
**Entrées / sorties** : 1 entrée · 1 sortie **« encore »** (retour au début de la boucle) · 1 sortie **« terminé »**.
**Réglages** : nombre de tours (1 → ∞) · condition d'arrêt (optionnelle, choisie parmi les signaux de la salle).
**Aperçu** : anneau gradué avec les tours faits en corail, tour courant en chiffres.
**Si problème** : borne dure de 50 tours même sur ∞, avec note Sécurité.

## 7. Séquence réutilisable (famille Le déroulé)
**Pourquoi** : « noir salle + voix off + lumière lente » revient quatre fois. Une séquence est un sous-déroulé nommé, instancié comme un bloc, modifié à un seul endroit.
**Entrées / sorties** : 1 entrée · autant de sorties que la séquence en déclare (par défaut 1 « fin »).
**Réglages** : séquence choisie (liste) · variante (paramètres exposés par la séquence : durée globale, intensité).
**Aperçu** : miniature du sous-graphe en pastilles, étape en cours allumée, double-clic pour entrer dedans (fil d'Ariane « Prologue › Séquence noir »).
**Si problème** : séquence supprimée → bloc en pointillés rouges, sortie directe.

## 8. Message à une personne (famille Qui)
**Pourquoi** : le streamer, le comédien en coulisse, le régisseur plateau reçoivent des consignes individuelles. Le bloc « Cible » actuel vise des groupes du public, pas un rôle précis avec accusé de lecture.
**Entrées / sorties** : 1 entrée · 2 sorties **« lu »** et **« non lu »** après délai.
**Réglages** : destinataire (rôle du tiroir Assets) · délai avant « non lu ».
**Aperçu** : bulle de message, nom du rôle, coche double à la lecture, horodatage.
**Si problème** : non lu → sortie dédiée + bandeau « Milo n'a pas lu la consigne ».

## 9. Chrono visible (famille Écrans du public)
**Pourquoi** : le public doit voir qu'il lui reste 20 secondes pour voter, pour s'asseoir, pour allumer son téléphone. Le compte à rebours actuel est interne à la régie.
**Entrées / sorties** : 1 entrée · 1 sortie « zéro » · sortie optionnelle « 10 s restantes » pour lancer un son.
**Réglages** : durée · affichage (téléphones / écran de scène / les deux).
**Aperçu** : chiffres LCD géants, arc qui se vide, dernier tiers en corail.
**Si problème** : si la connexion aux téléphones tombe, l'écran de scène prend le relais automatiquement.

## 10. Point de reprise (famille Points d'arrêt)
**Pourquoi** : panne, évacuation, comédien malade : il faut pouvoir reprendre le spectacle à un endroit sûr avec le bon état (mémoires, lumière, écrans publics) sans tout rejouer. Le « reset » actuel repart de zéro.
**Entrées / sorties** : 1 entrée · 1 sortie (passage direct, le bloc ne dure pas).
**Réglages** : nom du point · ce qui est restauré (mémoires / état plateau / écrans publics).
**Aperçu** : drapeau à damier, heure du dernier passage, bouton « REPRENDRE ICI » dans le pupitre.
**Si problème** : reprise impossible (état incomplet) → le pupitre propose le point de reprise précédent.

---

## Ordre de fabrication proposé
1 Garde-fou de temps → 2 Mémoire → 5 Commande machine → 4 Écoute d'un signal → 9 Chrono visible → 3 Tirage → 6 Boucle → 8 Message à une personne → 10 Point de reprise → 7 Séquence réutilisable (le plus lourd : sous-graphes et fil d'Ariane).

## Conséquences sur le modèle
- Les sorties nommées (« remplie / dépassé », « lu / non lu ») confirment le choix fait aujourd'hui : **les sorties appartiennent au bloc source**, ordonnées, visibles dans son corps et sur ses ronds de droite ; l'étiquette de branche n'est qu'une vue de la même sortie.
- Les **mémoires** deviennent une source de condition au même titre que les signaux de la salle (votes, présence, bruit, top).
- Chaque bloc à risque (machine, signal, message) écrit dans la piste **Sécurité** quand il échoue ; l'équipe voit tout au même endroit.
