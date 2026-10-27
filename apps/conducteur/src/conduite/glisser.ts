// Le geste de glisser (commun/tete.js `glisser`) : capture du pointeur, `bouger` à chaque mouvement, `lacher` au lâcher.
export function glisser(
  e: { currentTarget: EventTarget | null; pointerId: number },
  bouger: (ev: PointerEvent) => void,
  lacher: (ev: PointerEvent) => void = () => {},
): void {
  const cible = e.currentTarget as Element | null;
  try { cible?.setPointerCapture(e.pointerId); } catch { /* le pointeur n'est plus là */ }
  const fini = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', bouger);
    window.removeEventListener('pointerup', fini);
    window.removeEventListener('pointercancel', fini);
    lacher(ev);
  };
  window.addEventListener('pointermove', bouger);
  window.addEventListener('pointerup', fini);
  window.addEventListener('pointercancel', fini);
}
