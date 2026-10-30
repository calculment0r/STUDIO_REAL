import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/index.css';
import { chargerPolicePrivee } from './theme/polices';
import App from './App';

// Le pont des figurants (coquille/pont-figurants.ts) est retiré : le serveur de spectacle le remplace (client régie :
// etat/spectacle.ts, démarré par la coquille).
void chargerPolicePrivee();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
