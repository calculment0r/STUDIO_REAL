// Venus Rising : police d'affichage du design, livrée dans public/polices/ (dépôt, dist/, GitHub Pages).
// Absente : la promesse échoue sans bruit et le texte reste en Chakra Petch 700 (repli de --f-disp).
// La face couvre les graisses 100 → 900 : le navigateur ne fabrique jamais de faux gras sur Venus Rising.

const URL_VENUS = ((import.meta.env?.BASE_URL as string | undefined) ?? '/').replace(/\/?$/, '/') + 'polices/venus-rising.otf';

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
