#!/usr/bin/env node
/**
 * RTDB admin helper (émulateur par défaut)
 * Commandes:
 *  - add-admin --uid <UID>
 *  - rm-admin --uid <UID>
 *  - ls-admin
 *  - set-owner --room <ROOM_ID> --uid <OWNER_UID>
 *
 * Options communes:
 *  --prod                 cible la prod (sinon émulateur)
 *  --project <ID>         projectId (utile en prod)
 *  --dbNamespace <NS>     namespace RTDB (par ex. tag-cartesien)
 *  --sa <path.json>       chemin vers la clé service account (prod)
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';
import admin from 'firebase-admin';

// ---------- Utils CLI ----------
function parseArgs(argv) {
  const args = {};
  let cmd = null;
  const cmds = new Set(['add-admin', 'rm-admin', 'ls-admin', 'set-owner']);

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (cmds.has(a) && !cmd) { cmd = a; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const nxt = argv[i + 1];
      if (!nxt || nxt.startsWith('--')) { args[key] = true; }
      else { args[key] = nxt; i++; }
    }
  }
  return { cmd, args };
}

function required(val, name) {
  if (!val) {
    console.error(`✘ Argument requis manquant: --${name}`);
    process.exit(1);
  }
}

function log(msg, ...rest) {
  console.log(msg, ...rest);
}

// ---------- Init Firebase Admin ----------
// --- PATCH: remplacer toute la fonction initAdmin par ceci ---
async function initAdmin({ prod, project, dbNamespace, saPath }) {
  // Choix du namespace (priorité: argument --dbNamespace > --project > env > valeur de secours)
  const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined;
  const ns = dbNamespace || project || envProject || 'demo-emulator';

  if (!prod) {
    // ---------- ÉMULATEUR ----------
    // L’Admin SDK a BESOIN d’un databaseURL même en émulateur
    // Le format attendu est: http://127.0.0.1:9000?ns=<namespace>
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
    const databaseURL = `http://127.0.0.1:9000?ns=${ns}`;

    admin.initializeApp({
      projectId: ns,
      databaseURL, // <- indispensable
    });

    console.log('✓ Émulateur RTDB', { projectId: ns, databaseURL });
  } else {
    // ---------- PRODUCTION ----------
    // Crédential
    const cred = saPath
      ? admin.credential.cert(JSON.parse(fs.readFileSync(path.resolve(saPath), 'utf8')))
      : admin.credential.applicationDefault();

    // Si l’utilisateur t’a donné un namespace explicite, on l’utilise tel quel.
    // Sinon, par défaut on cible l’instance "default" : <projectId>-default-rtdb
    const effectiveProject = project || (cred.projectId ?? envProject);
    const effectiveNs = dbNamespace || (effectiveProject ? `${effectiveProject}-default-rtdb` : null);
    if (!effectiveNs) {
      throw new Error('Impossible de déterminer le projectId / namespace RTDB en production. Passe --project ou --dbNamespace, ou configure GOOGLE_APPLICATION_CREDENTIALS.');
    }

    const databaseURL = `https://${effectiveNs}.firebasedatabase.app`; // domaine moderne RTDB

    admin.initializeApp({
      credential: cred,
      projectId: effectiveProject,
      databaseURL, // <- indispensable
    });

    console.log('✓ Production RTDB', { projectId: effectiveProject, databaseURL });
  }

  return admin.database();
}

// ---------- Actions ----------
async function addAdmin(db, uid) {
  await db.ref(`admins/${uid}`).set(true);
  log(`✓ Admin ajouté: ${uid}`);
}
async function rmAdmin(db, uid) {
  await db.ref(`admins/${uid}`).remove();
  log(`✓ Admin retiré: ${uid}`);
}
async function lsAdmin(db) {
  const snap = await db.ref('admins').get();
  const val = snap.exists() ? snap.val() : {};
  const list = Object.entries(val).filter(([, v]) => v === true).map(([k]) => k);
  if (!list.length) {
    log('∅ Aucun admin défini.');
  } else {
    log('✓ Admins:', list.join(', '));
  }
}
async function setOwner(db, roomId, uid) {
  const ref = db.ref(`roomsMeta/${roomId}/ownerUid`);
  const snap = await ref.get();
  if (snap.exists()) {
    log(`⚠ ownerUid déjà défini pour room ${roomId}: ${snap.val()}`);
    log('   (supprime manuellement si tu veux le remplacer)');
    return;
  }
  await ref.set(uid);
  log(`✓ ownerUid défini pour room ${roomId}: ${uid}`);
}

// ---------- Main ----------
(async () => {
  const { cmd, args } = parseArgs(process.argv);
  if (!cmd) {
    console.log(`Usage:
  node rtdb-admin.mjs <commande> [options]

Commandes:
  add-admin   --uid <UID>                 Ajoute un admin
  rm-admin    --uid <UID>                 Retire un admin
  ls-admin                                Liste les admins
  set-owner   --room <ROOM_ID> --uid <UID>Définit l'owner d'une room (si absent)

Options:
  --prod                      Vise la production (sinon émulateur)
  --project <ID>              ProjectId (prod surtout)
  --dbNamespace <NS>          Namespace RTDB (ex: tag-cartesien)
  --sa <path.json>            Clé service account (prod)`);
    process.exit(0);
  }

  const prod = !!args.prod;
  const project = args.project || undefined;
  const dbNamespace = args.dbNamespace || undefined;
  const saPath = args.sa || undefined;

  const db = await initAdmin({ prod, project, dbNamespace, saPath });

  try {
    if (cmd === 'add-admin') {
      required(args.uid, 'uid');
      await addAdmin(db, args.uid);
    } else if (cmd === 'rm-admin') {
      required(args.uid, 'uid');
      await rmAdmin(db, args.uid);
    } else if (cmd === 'ls-admin') {
      await lsAdmin(db);
    } else if (cmd === 'set-owner') {
      required(args.room, 'room');
      required(args.uid, 'uid');
      await setOwner(db, args.room, args.uid);
    } else {
      console.error(`Commande inconnue: ${cmd}`);
      process.exit(1);
    }
  } catch (err) {
    console.error('✘ ERREUR:', err?.message || err);
    process.exit(2);
  } finally {
    // Fermeture propre de l’Admin SDK
    await admin.app().delete().catch(() => {});
  }
})();
