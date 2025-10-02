// scripts/snapshot.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const OUTFILE = process.env.OUTFILE || 'snapshot_all.txt';

// Dossiers à exclure
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.angular', 'dist', 'build', 'out', 'coverage',
  '.vscode', '.idea', 'tmp', 'temp'
]);

// Extensions autorisées (sans le point)
const EXT = new Set([
  'ts','tsx','js','jsx','mjs','cjs','html','css','scss','json','md','yml','yaml','sh','ps1','bat'
]);

/** retourne true si un chemin contient un dossier exclu */
function isExcluded(p) {
  const parts = path.relative(ROOT, p).split(path.sep);
  return parts.some(part => EXCLUDE_DIRS.has(part));
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
      if (EXT.has(ext)) files.push(p);
    }
  }
  return files;
}

async function main() {
  const files = await walk(ROOT, []);
  // vide le fichier de sortie
  await fs.writeFile(path.join(ROOT, OUTFILE), '', 'utf8');

  for (const f of files) {
    const abs = f;
    const rel = path.relative(ROOT, f);
    let content = '';
    try {
      content = await fs.readFile(f, 'utf8');
    } catch {
      continue;
    }

    const header =
`────────────────────────────────────────────────────────────
FILE: ${abs}
REL:  ${rel}
────────────────────────────────────────────────────────────
`;
    await fs.appendFile(path.join(ROOT, OUTFILE), header + content + '\n\n', 'utf8');
  }

  console.log(`OK → ${OUTFILE} (${files.length} files)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
