import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

export const onTagEventCreate = onDocumentCreated(
  'projects/_/databases/(default)/documents/events/{eventId}',
  async (event: { data: any; }) => {
    const snap = event.data; if (!snap) return;
    const data = snap.data() as any;
    if (data?.type !== 'tag') return;

    const rtdb = getDatabase();
    const fs = getFirestore();

    const now = new Date();
    const hour = now.toISOString().slice(11, 13);

    // RTDB compteur shardé
    const shard = Math.floor(Math.random() * 10);
    await rtdb.ref(`counters/tags/hourly/${hour}/shards/${shard}`).transaction((n) => (n || 0) + 1);

    // Cache sur la room
    if (data?.roomId) {
      const roomRef = fs.doc(`rooms/${data.roomId}`);
      await roomRef.set({ lastEventAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
);

export const hourlyRollup = onSchedule('every 60 minutes', async () => {
  const rtdb = getDatabase();
  const fs = getFirestore();
  const snap = await rtdb.ref('counters/tags/hourly').get();
  const perHour = (snap.val() || {}) as Record<string, { shards: Record<string, number> }>;
  const tagsPerHour: Record<string, number> = {};
  for (const [h, node] of Object.entries(perHour)) {
    tagsPerHour[h] = Object.values(node.shards || {}).reduce((a, b) => a + (b || 0), 0);
  }
  const total = Object.values(tagsPerHour).reduce((a, b) => a + b, 0);
  await fs.doc('admin/stats/daily').set({
    date: new Date().toISOString().slice(0,10),
    tagsPerHour,
    tagsTotal: total,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
});
