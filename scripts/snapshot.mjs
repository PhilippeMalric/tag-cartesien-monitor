// scripts/snapshot.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Personnalisables via variables d'env si besoin
const OUTFILE       = process.env.OUTFILE || 'snapshot_all.txt';
const EXTERNAL_DIR  = process.env.EXTERNAL_DIR || 'external'; // racine des projets externes
const LIBS_SEGMENT  = process.env.LIBS_SEGMENT || 'libs';     // nom du dossier libs

// Répertoires exclus (optimisation/sécurité)
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.angular', 'dist', 'build', 'out', 'coverage',
  '.vscode', '.idea', 'tmp', 'temp'
]);

// Extensions autorisées (sans le point)
const EXT = new Set([
  'ts','tsx','js','jsx','mjs','cjs','html','css','scss','json','md','yml','yaml','sh','ps1','bat'
]);

const EXTERNAL_ROOT = path.join(ROOT, EXTERNAL_DIR);

/** true si `p` passe par un dossier exclu */
function isExcluded(p) {
  const parts = path.relative(ROOT, p).split(path.sep);
  return parts.some(part => EXCLUDE_DIRS.has(part));
}


function isInExternalLib(p) {
  const relToExternal = path.relative(EXTERNAL_ROOT, p);
  if (relToExternal.startsWith('..')) return false; // pas dans external/
  const parts = relToExternal.split(path.sep);
  return parts.includes(LIBS_SEGMENT);
}

/** true si `p` appartient au projet principal (i.e., pas dans external/) */
function isInMainProject(p) {
  const relToRoot = path.relative(ROOT, p);
  // Exclure OUTFILE lui-même pour éviter de se snapshotter
  if (relToRoot === OUTFILE) return false;
  // True si le chemin ne commence PAS par external/
  return !relToRoot.startsWith(EXTERNAL_DIR + path.sep) && relToRoot !== EXTERNAL_DIR;
}

/** Retourne "EXTERNAL_LIB" ou "PROJECT" si inclus, sinon null */
function getScopeTagForFile(p) {
  if (isInExternalLib(p)) return 'EXTERNAL_LIB';
  if (isInMainProject(p)) return 'PROJECT';
  return null;
}

async function walk(dir, files = []) {
  if (isExcluded(dir)) return files;

  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (isExcluded(p)) continue;

    if (e.isDirectory()) {
      await walk(p, files);
    } else {
      const ext = path.extname(p).slice(1).toLowerCase();
      if (!EXT.has(ext)) continue;

      const scope = getScopeTagForFile(p);
      if (!scope) continue; // ni external/**/libs/** ni projet principal

      files.push({ path: p, scope });
    }
  }
  return files;
}

async function main() {
  const outPath = path.join(ROOT, OUTFILE);
  await fs.writeFile(outPath, '', 'utf8'); // vide la sortie

  const fileEntries = await walk(ROOT, []);
  for (const { path: f, scope } of fileEntries) {
    let content = '';
    try {
      content = await fs.readFile(f, 'utf8');
    } catch {
      continue;
    }

    const abs = f;
    const rel = path.relative(ROOT, f);
    const header =
`────────────────────────────────────────────────────────────
SCOPE: ${scope}
FILE : ${abs}
REL  : ${rel}
────────────────────────────────────────────────────────────
`;
    await fs.appendFile(outPath, header + content + '\n\n', 'utf8');
  }

  console.log(`OK → ${OUTFILE} (${fileEntries.length} files, scopes: PROJECT + ${EXTERNAL_DIR}/**/${LIBS_SEGMENT}/**)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
