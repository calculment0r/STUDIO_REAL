// Venus Rising : police d'affichage du design, SANS licence connue → jamais dans le dépôt ni dans dist/.
// On la charge à l'exécution depuis /polices-privees/ (servi par vite.config.ts, en dev et en preview, à partir du
// fichier local hors git conception/conducteur/source/uploads/). Absente : la promesse échoue sans bruit et le texte
// reste en Chakra Petch 700 (repli déclaré par --f-disp et la graisse 700 des éléments d'affichage).
// La face couvre les graisses 100 → 900 : le navigateur ne fabrique jamais de faux gras sur Venus Rising.

const URL_VENUS = '/polices-privees/Venus%20Rising%20Rg.otf';

export async function chargerPolicePrivee(): Promise<boolean> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return false;
  try {
    const face = new FontFace('Venus Rising', `url("${URL_VENUS}") format("opentype")`, {
      weight: '100 900',
      style: 'normal',
      display: 'swap',
    });
    await face.load();
    document.fonts.add(face);
    document.documentElement.dataset.venus = 'oui';
    return true;
  } catch {
    document.documentElement.dataset.venus = 'repli';
    return false;
  }
}
