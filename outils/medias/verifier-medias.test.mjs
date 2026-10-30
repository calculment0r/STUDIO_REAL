// Tests du vérificateur de médias : données ffprobe écrites à la main, aucun ffmpeg requis.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  intervalleImagesClesDepuisCsv,
  moovEnTete,
  nomVersionne,
  sha256Fichier,
  verifier,
} from './verifier-medias.mjs';

/** Vidéo 720×1280 H.264 + AAC à 1,5 Mb/s, conforme à la cible telephone. */
function videoValide(surcharge = {}) {
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', bit_rate: '1500000', duration: '12.5' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280 },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
    ...surcharge,
  };
}

function mp3(debit = '128000') {
  return { format: { format_name: 'mp3', bit_rate: debit, duration: '30' }, streams: [{ codec_type: 'audio', codec_name: 'mp3' }] };
}

/** Atome MP4 : taille (4 octets BE) + type + contenu. */
function atome(type, contenu = Buffer.alloc(0)) {
  const e = Buffer.alloc(8);
  e.writeUInt32BE(8 + contenu.length, 0);
  e.write(type, 4, 'latin1');
  return Buffer.concat([e, contenu]);
}

describe('verifier : vidéo', () => {
  it('accepte un 720p vertical H.264/AAC avec moov en tête', () => {
    expect(verifier(videoValide(), { cible: 'telephone', moovEnTete: true })).toEqual({ ok: true, raisons: [] });
  });

  it('accepte une vidéo sans piste audio', () => {
    const info = videoValide();
    info.streams = [info.streams[0]];
    expect(verifier(info, { cible: 'telephone', moovEnTete: true }).ok).toBe(true);
  });

  it('refuse le HEVC', () => {
    const info = videoValide();
    info.streams[0].codec_name = 'hevc';
    const r = verifier(info, { cible: 'telephone', moovEnTete: true });
    expect(r.ok).toBe(false);
    expect(r.raisons.join(' ')).toMatch(/hevc/);
  });

  it('refuse un audio qui n\'est pas AAC', () => {
    const info = videoValide();
    info.streams[1].codec_name = 'mp3';
    expect(verifier(info, { cible: 'telephone', moovEnTete: true }).ok).toBe(false);
  });

  it('refuse une piste de données (tmcd)', () => {
    const info = videoValide();
    info.streams.push({ codec_type: 'data', codec_name: 'none', codec_tag_string: 'tmcd' });
    const r = verifier(info, { cible: 'telephone', moovEnTete: true });
    expect(r.ok).toBe(false);
    expect(r.raisons.join(' ')).toMatch(/tmcd/);
  });

  it('refuse du 1080p en cible telephone mais l\'accepte en cible scene', () => {
    const info = videoValide();
    info.streams[0].width = 1920;
    info.streams[0].height = 1080;
    expect(verifier(info, { cible: 'telephone', moovEnTete: true }).ok).toBe(false);
    expect(verifier(info, { cible: 'scene', moovEnTete: true }).ok).toBe(true);
  });

  it('accepte le format paysage 1280×720 en cible telephone', () => {
    const info = videoValide();
    info.streams[0].width = 1280;
    info.streams[0].height = 720;
    expect(verifier(info, { cible: 'telephone', moovEnTete: true }).ok).toBe(true);
  });

  it('refuse un débit trop haut (2 Mb/s en telephone, 10 Mb/s en scene)', () => {
    const info = videoValide();
    info.format.bit_rate = '2000001';
    expect(verifier(info, { cible: 'telephone', moovEnTete: true }).ok).toBe(false);
    info.format.bit_rate = '10000001';
    info.streams[0].width = 1920;
    info.streams[0].height = 1080;
    expect(verifier(info, { cible: 'scene', moovEnTete: true }).ok).toBe(false);
  });

  it('refuse quand moovEnTete est faux ou non fourni', () => {
    expect(verifier(videoValide(), { cible: 'telephone', moovEnTete: false }).ok).toBe(false);
    expect(verifier(videoValide(), { cible: 'telephone' }).ok).toBe(false);
  });

  it('refuse un intervalle d\'images clés au-dessus de 2,5 s, l\'accepte à 2 s ou absent', () => {
    expect(verifier(videoValide({ intervalleImagesCles: 4 }), { cible: 'telephone', moovEnTete: true }).ok).toBe(false);
    expect(verifier(videoValide({ intervalleImagesCles: 2 }), { cible: 'telephone', moovEnTete: true }).ok).toBe(true);
    expect(verifier(videoValide(), { cible: 'telephone', moovEnTete: true }).ok).toBe(true);
  });

  it('cumule plusieurs raisons', () => {
    const info = videoValide();
    info.streams[0].codec_name = 'hevc';
    const r = verifier(info, { cible: 'telephone', moovEnTete: false });
    expect(r.raisons.length).toBeGreaterThanOrEqual(2);
  });
});

describe('verifier : audio et image', () => {
  it('accepte un mp3 à 128 kb/s', () => {
    expect(verifier(mp3(), { cible: 'telephone', moovEnTete: false })).toEqual({ ok: true, raisons: [] });
  });

  it('refuse un mp3 au-dessus de 192 kb/s', () => {
    expect(verifier(mp3('320000'), { cible: 'telephone', moovEnTete: false }).ok).toBe(false);
  });

  it('refuse un wav (pcm)', () => {
    const info = { format: { format_name: 'wav', bit_rate: '1411200' }, streams: [{ codec_type: 'audio', codec_name: 'pcm_s16le' }] };
    expect(verifier(info, { cible: 'telephone', moovEnTete: false }).ok).toBe(false);
  });

  it('ne vérifie rien sur une image', () => {
    const info = { format: { format_name: 'image2' }, streams: [{ codec_type: 'video', codec_name: 'mjpeg', width: 4000, height: 3000 }] };
    expect(verifier(info, { cible: 'telephone', moovEnTete: false })).toEqual({ ok: true, raisons: [] });
  });
});

describe('moovEnTete', () => {
  const ftyp = atome('ftyp', Buffer.from('isom0000', 'latin1'));
  const moov = atome('moov', Buffer.alloc(20));
  const mdat = atome('mdat', Buffer.alloc(100));

  it('renvoie true pour ftyp, moov, mdat', () => {
    expect(moovEnTete(Buffer.concat([ftyp, moov, mdat]))).toBe(true);
  });

  it('renvoie false pour ftyp, mdat, moov', () => {
    expect(moovEnTete(Buffer.concat([ftyp, mdat, moov]))).toBe(false);
  });

  it('gère la taille étendue sur 8 octets', () => {
    const contenu = Buffer.alloc(30);
    const entete = Buffer.alloc(16);
    entete.writeUInt32BE(1, 0);
    entete.write('free', 4, 'latin1');
    entete.writeBigUInt64BE(BigInt(16 + contenu.length), 8);
    expect(moovEnTete(Buffer.concat([ftyp, entete, contenu, moov, mdat]))).toBe(true);
  });

  it('renvoie false sans moov ni mdat, ou sur un atome corrompu', () => {
    expect(moovEnTete(ftyp)).toBe(false);
    const casse = Buffer.alloc(8);
    casse.writeUInt32BE(3, 0);
    casse.write('free', 4, 'latin1');
    expect(moovEnTete(Buffer.concat([ftyp, casse, moov]))).toBe(false);
  });

  it('lit aussi un fichier sur disque', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'medias-'));
    try {
      const bon = join(dossier, 'bon.mp4');
      const mauvais = join(dossier, 'mauvais.mp4');
      writeFileSync(bon, Buffer.concat([ftyp, moov, mdat]));
      writeFileSync(mauvais, Buffer.concat([ftyp, mdat, moov]));
      expect(moovEnTete(bon)).toBe(true);
      expect(moovEnTete(mauvais)).toBe(false);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});

describe('manifeste : empreinte et nom versionné', () => {
  it('construit le nom versionné avec les 8 premiers caractères du sha256', () => {
    const sha = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    expect(nomVersionne('intro.mp4', sha)).toBe('intro.abcdef01.mp4');
    expect(nomVersionne('bruit.de.pas.mp3', sha)).toBe('bruit.de.pas.abcdef01.mp3');
  });

  it('calcule le sha256 en flux', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'medias-'));
    try {
      const f = join(dossier, 'abc.txt');
      writeFileSync(f, 'abc');
      expect(await sha256Fichier(f)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});

describe('intervalleImagesClesDepuisCsv', () => {
  it('renvoie le plus grand écart entre images clés', () => {
    const csv = ['frame,1,0.000000', 'frame,0,0.033333', 'frame,0,0.066667', 'frame,1,2.000000', 'frame,0,2.033333', 'frame,1,5.000000'].join('\n');
    expect(intervalleImagesClesDepuisCsv(csv)).toBeCloseTo(3, 5);
  });

  it('renvoie undefined avec moins de deux images clés', () => {
    expect(intervalleImagesClesDepuisCsv('frame,1,0.000000\nframe,0,0.04')).toBeUndefined();
  });
});
