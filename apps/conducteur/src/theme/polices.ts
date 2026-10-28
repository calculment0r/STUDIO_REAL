// Venus Rising : police d'affichage du design, versionnée dans packages/theme/polices/ à la demande du propriétaire
// (commit 88e2925). Vite la copie dans dist/ (GitHub Pages compris) avec une empreinte et nous donne son adresse.
// Absente ou illisible : la promesse échoue sans bruit et le texte reste en Chakra Petch 700 (repli de --f-disp).
// La face couvre les graisses 100 → 900 : le navigateur ne fabrique jamais de faux gras sur Venus Rising.
import urlVenus from '@studio-real/theme/polices/venus-rising.otf?url';

export async function chargerPolicePrivee(): Promise<boolean> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return false;
  try {
    const face = new FontFace('Venus Rising', `url("${urlVenus}") format("opentype")`, {
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
