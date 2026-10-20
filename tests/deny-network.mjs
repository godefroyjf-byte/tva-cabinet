// Préchargement réservé au test OCR hors ligne, hérité par ses worker_threads.
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
const denied=()=>{throw new Error('Tout accès réseau est interdit pendant cette recette OCR.');};
http.request=denied;http.get=denied;https.request=denied;https.get=denied;
globalThis.fetch=async()=>denied();
syncBuiltinESMExports();
