import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Polices sans licence connue (Venus Rising) : JAMAIS dans le dépôt public ni dans dist/. En local seulement, on sert
// /polices-privees/<fichier> depuis conception/conducteur/source/uploads/ (hors git) ; absent → 404, et l'application
// reste sur son repli libre (Chakra Petch 700, voir src/theme/polices.ts).
const DOSSIER_PRIVE = fileURLToPath(new URL('../../conception/conducteur/source/uploads', import.meta.url))

function policesPrivees(): Plugin {
  const servir: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/polices-privees/')) return next()
    const nom = basename(decodeURIComponent(url.slice('/polices-privees/'.length).split('?')[0]))
    const fichier = resolve(DOSSIER_PRIVE, nom)
    if (!/\.(otf|ttf|woff2?)$/i.test(nom) || !existsSync(fichier)) { res.statusCode = 404; res.end(); return }
    res.setHeader('Content-Type', nom.endsWith('.otf') ? 'font/otf' : nom.endsWith('.ttf') ? 'font/ttf' : 'font/woff2')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(readFileSync(fichier))
  }
  return {
    name: 'polices-privees',
    configureServer(server) { server.middlewares.use(servir) },
    configurePreviewServer(server) { server.middlewares.use(servir) },
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), policesPrivees(), mediasLocales()],
  build: { rollupOptions: { input: PAGES } },
})
