# Service de transcription du prototype P0.5 : Whisper large-v3-turbo sur le GPU d'un DGX.
# Aucune dépendance à installer : réutilise un environnement Python existant qui a torch (CUDA) et transformers,
# et le modèle déjà présent dans le cache Hugging Face (local_files_only).
#
#   python serveur_asr.py [--port 8795] [--modele openai/whisper-large-v3-turbo]
#   POST /transcrire  corps = PCM 16 bits signé, mono, 16 kHz (little-endian)  ->  {"texte": "...", "ms": 312, "duree_s": 2.4}
#   GET  /sante                                                               ->  {"ok": true, "modele": "...", "gpu": "..."}
import argparse, json, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=8795)
ap.add_argument('--hote', default='127.0.0.1')
ap.add_argument('--modele', default='openai/whisper-large-v3-turbo')
args = ap.parse_args()

dev = 'cuda' if torch.cuda.is_available() else 'cpu'
dtype = torch.float16 if dev == 'cuda' else torch.float32
t0 = time.time()
processeur = AutoProcessor.from_pretrained(args.modele, local_files_only=True)
modele = AutoModelForSpeechSeq2Seq.from_pretrained(args.modele, torch_dtype=dtype, local_files_only=True).to(dev).eval()
print(f'modèle {args.modele} chargé sur {dev} en {time.time() - t0:.1f} s', flush=True)
verrou = threading.Lock()   # une transcription à la fois sur le GPU


def transcrire(pcm: bytes):
    audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
    duree = len(audio) / 16000
    if duree < 0.3:
        return '', 0, duree
    t = time.time()
    entrees = processeur(audio, sampling_rate=16000, return_tensors='pt')
    feats = entrees.input_features.to(dev, dtype=dtype)
    with verrou, torch.inference_mode():
        ids = modele.generate(feats, language='fr', task='transcribe', max_new_tokens=120)
    texte = processeur.batch_decode(ids, skip_special_tokens=True)[0].strip()
    return texte, int((time.time() - t) * 1000), duree


class Gestion(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('content-type', 'application/json; charset=utf-8')
        self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        if self.path == '/sante':
            return self._json(200, {'ok': True, 'modele': args.modele, 'gpu': torch.cuda.get_device_name(0) if dev == 'cuda' else 'cpu'})
        self._json(404, {'erreur': 'introuvable'})

    def do_POST(self):
        if self.path != '/transcrire':
            return self._json(404, {'erreur': 'introuvable'})
        n = int(self.headers.get('content-length') or 0)
        if n <= 0 or n > 16000 * 2 * 30:            # 30 s au plus
            return self._json(400, {'erreur': 'taille'})
        try:
            texte, ms, duree = transcrire(self.rfile.read(n))
            self._json(200, {'texte': texte, 'ms': ms, 'duree_s': round(duree, 2)})
        except Exception as e:                       # jamais de plantage du service sur une requête
            self._json(500, {'erreur': str(e)[:200]})

    def log_message(self, *a):
        pass


# préchauffe : la première génération compile les noyaux
transcrire((np.zeros(16000, dtype='<i2')).tobytes())
print(f'PRET http://{args.hote}:{args.port}', flush=True)
ThreadingHTTPServer((args.hote, args.port), Gestion).serve_forever()
