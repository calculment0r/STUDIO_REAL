// Entrée de la page sortie.html (chantier SORTIE SCÈNE) : thème de l'interface (jetons, polices), toujours sombre.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../theme/index.css';
import './sortie.css';
import { chargerPolicePrivee } from '../theme/polices';
import { PageSortie } from './page';

document.documentElement.dataset.theme = 'dark';
document.documentElement.classList.add('so-page-sortie');
void chargerPolicePrivee();

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <PageSortie />
  </StrictMode>,
);
