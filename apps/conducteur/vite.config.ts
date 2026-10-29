import { type Connect, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Les polices (Chakra Petch, Azeret Mono, Venus Rising) viennent de packages/theme/polices/ : le CSS du paquet
// @studio-real/theme les référence et Vite les copie dans dist/. Venus Rising est versionnée dans le dépôt, à la demande
// du propriétaire (commit 88e2925) : il n'y a plus de dossier privé ni de route /polices-privees/ à servir.
// Les licences OFL qui accompagnent les polices (polices/*.txt) ne sont référencées par aucun CSS : ce greffon les
// recopie dans dist/polices/, comme le faisait l'ancien dossier public/polices/.
const DOSSIER_POLICES = fileURLToPath(new URL('../../packages/theme/polices', import.meta.url))

function licencesPolices(): Plugin {
  return {
    name: 'licences-polices',
    generateBundle() {
      if (!existsSync(DOSSIER_POLICES)) return
      for (const nom of readdirSync(DOSSIER_POLICES)) {
        if (nom.endsWith('.txt')) this.emitFile({ type: 'asset', fileName: 'polices/' + nom, source: readFileSync(resolve(DOSSIER_POLICES, nom)) })
      }
    },
  }
}

// Médias locaux de la sortie écran scène (vidéos précalculées) : en développement et en preview, /medias-locales/
// sert C:\STUDIO_REAL\medias-locales\ (dossier HORS git). GET /medias-locales/ → liste JSON des fichiers ;
// GET /medias-locales/<nom> → le fichier, avec les plages (Range) dont <video> a besoin pour se positionner.
// En représentation, la sortie lit plutôt un dossier choisi sur la machine (src/sortie/medias.ts).
const DOSSIER_MEDIAS = fileURLToPath(new URL('../../medias-locales', import.meta.url))
const TYPES_MEDIA: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', ogv: 'video/ogg',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
}
const extension = (n: string) => n.split('.').pop()?.toLowerCase() ?? ''

function mediasLocales(): Plugin {
  const servir: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/medias-locales/')) return next()
    const nom = basename(decodeURIComponent(url.slice('/medias-locales/'.length).split('?')[0]))
    if (!nom) {
      const liste = existsSync(DOSSIER_MEDIAS) ? readdirSync(DOSSIER_MEDIAS).filter((f) => extension(f) in TYPES_MEDIA) : []
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.end(JSON.stringify(liste))
      return
    }
    const fichier = resolve(DOSSIER_MEDIAS, nom)
    const type = TYPES_MEDIA[extension(nom)]
    if (!type || !existsSync(fichier)) { res.statusCode = 404; res.end(); return }
    const taille = statSync(fichier).size
    res.setHeader('Content-Type', type)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'no-cache')
    const plage = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (plage && (plage[1] || plage[2])) {
      let debut = plage[1] ? Number(plage[1]) : taille - Number(plage[2])
      let fin = plage[1] && plage[2] ? Number(plage[2]) : taille - 1
      debut = Math.max(0, debut); fin = Math.min(taille - 1, fin)
      if (debut > fin) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${taille}`); res.end(); return }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${debut}-${fin}/${taille}`)
      res.setHeader('Content-Length', String(fin - debut + 1))
      createReadStream(fichier, { start: debut, end: fin }).pipe(res)
      return
    }
    res.setHeader('Content-Length', String(taille))
    createReadStream(fichier).pipe(res)
  }
  return {
    name: 'medias-locales',
    configureServer(server) { server.middlewares.use(servir) },
    configurePreviewServer(server) { server.middlewares.use(servir) },
  }
}

// Pages : la régie (index.html), la sortie écran scène (sortie.html, chantier SORTIE SCÈNE) et la page téléphone du
// streamer (streamer.html, chantier FLUX ; prise seulement si elle existe déjà).
const ICI = fileURLToPath(new URL('.', import.meta.url))
const PAGES: Record<string, string> = { main: resolve(ICI, 'index.html'), sortie: resolve(ICI, 'sortie.html') }
if (existsSync(resolve(ICI, 'streamer.html'))) PAGES.streamer = resolve(ICI, 'streamer.html')

// Empreinte du code (__BUILD__) : annoncée par la sortie écran scène dans `bonjour` / `present` (src/sortie/protocole.ts),
// pour repérer une fenêtre restée ouverte sur un ancien code. Hash git court, sinon date ISO du build.
function empreinteBuild(): string {
  try {
    const h = execSync('git rev-parse --short HEAD', { cwd: ICI, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    if (/^[0-9a-f]{4,40}$/.test(h)) return h
  } catch { /* pas de git */ }
  return new Date().toISOString().slice(0, 16) + 'Z'
}

// https://vite.dev/config/
export default defineConfig({
  // Adresses RELATIVES dans le build (`./assets/…`) : le même dist se sert à la racine (vite dev, vite preview), sous
  // `/conducteur/` par le serveur de spectacle (apps/serveur-spectacle) et sous `./` sur GitHub Pages (`npm run pages`).
  // Avec la base `/` par défaut, la sortie servie sous /conducteur/sortie.html cherchait /assets/… → 404, page noire
  // (constaté à l’essai de la branche d’intégration le 29/10). Les pages n’ont que des routes en fragment (#…), donc
  // la base relative ne pose pas de problème de sous-chemin.
  base: "./",
  plugins: [react(), licencesPolices(), mediasLocales()],
  define: { __BUILD__: JSON.stringify(empreinteBuild()) },
  build: { rollupOptions: { input: PAGES } },
  // Vitest vide les fichiers CSS (même en ?raw) ; src/theme/jetons.ts lit les jetons du thème en ?raw, y compris dans les tests.
  test: { css: { include: [/theme[/]jetons.*[.]css/] } },
})
