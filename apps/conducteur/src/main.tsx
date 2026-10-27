import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/index.css';
import { chargerPolicePrivee } from './theme/polices';
import App from './App';
import { demarrerPontFigurants } from './coquille/pont-figurants';

void chargerPolicePrivee();
demarrerPontFigurants();   // spectacle du soir : chaque top pilote téléphones, mur et vote

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
