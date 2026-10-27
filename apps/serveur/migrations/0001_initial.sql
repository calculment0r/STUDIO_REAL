-- Schéma D1 du Conducteur : projets (dernier état enregistré), historique des versions, exécutions (runs).
-- Le projet est stocké au format d'échange `studio-real/conducteur@1` : `project` dans contenu, `assets` à part.
-- Les médias sont dans R2 (clé projets/<id>/<nom>), pas ici.

CREATE TABLE projets (
  id          TEXT PRIMARY KEY,                 -- p_xxxxxxxx
  titre       TEXT NOT NULL,
  jeton_hash  TEXT NOT NULL,                    -- SHA-256 hex du jeton d'accès (jamais le jeton)
  version     INTEGER NOT NULL DEFAULT 1,       -- numéro de la dernière version enregistrée
  contenu     TEXT NOT NULL,                    -- JSON de `project`
  assets      TEXT NOT NULL DEFAULT '[]',       -- JSON de `assets`
  cree_le     INTEGER NOT NULL,                 -- ms epoch
  modifie_le  INTEGER NOT NULL,
  modifie_par TEXT
);

CREATE TABLE versions (
  projet_id   TEXT NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  contenu     TEXT NOT NULL,
  assets      TEXT NOT NULL DEFAULT '[]',
  auteur      TEXT,
  message     TEXT,
  taille      INTEGER NOT NULL,
  cree_le     INTEGER NOT NULL,
  PRIMARY KEY (projet_id, version)
);

CREATE TABLE runs (
  projet_id   TEXT NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('repetition', 'scene')),
  debut       INTEGER NOT NULL,
  cree_le     INTEGER NOT NULL,
  PRIMARY KEY (projet_id, id)
);

-- Événements d'une exécution : `n` = rang fourni par le client → ajout idempotent (INSERT OR IGNORE).
CREATE TABLE evenements (
  projet_id   TEXT NOT NULL,
  run_id      TEXT NOT NULL,
  n           INTEGER NOT NULL,
  t           REAL NOT NULL,
  type        TEXT NOT NULL,
  donnees     TEXT NOT NULL,                    -- JSON de l'événement complet
  PRIMARY KEY (projet_id, run_id, n),
  FOREIGN KEY (projet_id, run_id) REFERENCES runs(projet_id, id) ON DELETE CASCADE
);

CREATE INDEX projets_modifie ON projets(modifie_le DESC);
