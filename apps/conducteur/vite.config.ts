import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), policesPrivees()],
})
