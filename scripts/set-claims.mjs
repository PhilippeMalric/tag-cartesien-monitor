// scripts/set-claims.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// --- Arguments ---
// 0: node
// 1: set-claims.mjs
// 2: email obligatoire
// 3: claims JSON (ex: '{"admin": true, "role": "teacher"}' ou '@claims.json')
// 4: (optionnel) chemin vers la clé de service .json
const [,, email, claimsArg, keyPathArg] = process.argv;

if (!email || !claimsArg) {
  console.error('Usage: node scripts/set-claims.mjs <email> <claimsJSON | @path.json> [serviceAccountKey.json]');
  console.error('Ex.:   node scripts/set-claims.mjs "prof@ecole.qc.ca" \'{"admin": true}\'');
  process.exit(1);
}

// --- Résolution du chemin de clé ---
// Priorité:
//   1) argument 4 si fourni
//   2) variable d'env GOOGLE_APPLICATION_CREDENTIALS
//   3) chemin par défaut fourni
const DEFAULT_KEY_PATH = 'C:\\Users\\malri\\tag-cartesien-monitor\\scripts\\secrets\\claims-admin.json';
const chosenKeyPath = keyPathArg ?? process.env.GOOGLE_APPLICATION_CREDENTIALS ?? DEFAULT_KEY_PATH;
const absKeyPath = path.resolve(chosenKeyPath);

if (!existsSync(absKeyPath)) {
  console.error(`Clé de service introuvable: ${absKeyPath}`);
  console.error('Spécifie-la en 3e argument ou via $env:GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(absKeyPath, 'utf8'));
} catch (e) {
  console.error(`Impossible de lire/parsing la clé: ${absKeyPath}`);
  console.error(e.message);
  process.exit(1);
}

// --- Init Admin SDK avec la clé explicite ---
initializeApp({ credential: cert(serviceAccount) });

// --- Charger les claims ---
let claimsJson = claimsArg;
if (claimsArg.startsWith('@')) {
  const filePath = claimsArg.slice(1);
  if (!existsSync(filePath)) {
    console.error(`Fichier de claims introuvable: ${filePath}`);
    process.exit(1);
  }
  claimsJson = readFileSync(filePath, 'utf8');
}

let claims;
try {
  claims = JSON.parse(claimsJson);
} catch (e) {
  console.error('Le 2e argument doit être du JSON valide, ex.: \'{"admin": true}\' (PowerShell) ou "{""admin"": true}" (CMD).');
  console.error('Erreur de parsing:', e.message);
  process.exit(1);
}

async function main() {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`OK: claims pour ${email} =>`, claims);
  console.log('Astuce: côté client, force un refresh avec getIdToken(true) pour voir les nouveaux claims.');
}

main().catch((e) => { console.error(e); process.exit(1); });
