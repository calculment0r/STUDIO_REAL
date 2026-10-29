// Tests de la ligne de commande (analyse des arguments, code de sortie 2) : rien n'est lancé, aucun réseau.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { analyserArguments } from './cli';

describe('ligne de commande des agents', () => {
  it('lit --url, --jeton, --acteur et --banques', () => {
    const r = analyserArguments(['figurants', '--url', 'ws://localhost:8790/ws', '--jeton', 'abc', '--acteur', 'figurants2', '--banques=echo', '--verbeux'], {});
    expect(r).toEqual({ arguments: { agent: 'figurants', url: 'ws://localhost:8790/ws', jeton: 'abc', acteur: 'figurants2', banques: 'echo', verbeux: true } });
  });

  it('le jeton peut venir de SPECTACLE_JETON_AGENT ; l\'acteur vaut figurants par défaut', () => {
    const r = analyserArguments(['figurants', '--url', 'wss://exemple.org/ws'], { SPECTACLE_JETON_AGENT: 'depuis-env' });
    expect(r).toMatchObject({ arguments: { jeton: 'depuis-env', acteur: 'figurants', verbeux: false } });
  });

  it('refuse sans --url, sans jeton, avec une adresse qui n\'est pas ws:// et un argument inconnu', () => {
    expect(analyserArguments(['figurants', '--jeton', 'x'], {})).toMatchObject({ erreur: expect.stringContaining('--url') });
    expect(analyserArguments(['figurants', '--url', 'ws://h/ws'], {})).toMatchObject({ erreur: expect.stringContaining('jeton') });
    expect(analyserArguments(['figurants', '--url', 'http://h/ws', '--jeton', 'x'], {})).toMatchObject({ erreur: expect.stringContaining('ws://') });
    expect(analyserArguments(['figurants', '--url', 'ws://h/ws', '--jeton', 'x', '--bizarre'], {})).toMatchObject({ erreur: expect.stringContaining('inconnu') });
    expect(analyserArguments(['osc'], {})).toMatchObject({ erreur: expect.stringContaining('inconnu') });
    expect(analyserArguments(['figurants', '--aide'], {})).toEqual({ aide: true });
  });

  it('le vrai processus sort avec le code 2 sans --url ni jeton, 0 avec --aide, et ne montre jamais un jeton', () => {
    const env = { ...process.env };
    delete env.SPECTACLE_JETON_AGENT;
    const sans = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'figurants'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
    expect(sans.status).toBe(2);
    expect(sans.stderr).toContain('--url');
    const aide = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'figurants', '--aide'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
    expect(aide.status).toBe(0);
    expect(aide.stdout).toContain('SPECTACLE_JETON_AGENT');
    const secret = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'figurants', '--jeton', 'jeton-secret-a-ne-pas-voir'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
    expect(secret.status).toBe(2);
    expect(secret.stderr + secret.stdout).not.toContain('jeton-secret-a-ne-pas-voir');
  }, 30_000);
});
