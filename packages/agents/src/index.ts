// Paquet des agents IA de STUDIO_REAL : clients du serveur de spectacle (protocole v2, rôle `agent`).
export * from './client-agent';
export { creerAgentFigurants, FileSortie, ECART_SAY_MS, INTERVALLE_STAT_MS, type AgentFigurants, type OptionsAgentFigurants } from './figurants/agent';
export { Orchestrateur, DENSITES } from './figurants/orchestrateur';
export { chargerBanques, dossierDeBanques } from './figurants/banques';
export { fournisseursDepuisEnv, FournisseurOllama, FournisseurAnthropic } from './figurants/fournisseurs';
export type { Banques, Persona, EtatFigurants, Hote, ItemReplique } from './figurants/types';
