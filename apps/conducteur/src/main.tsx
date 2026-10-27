import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/index.css';
import { chargerPolicePrivee } from './theme/polices';
import App from './App';

void chargerPolicePrivee();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
