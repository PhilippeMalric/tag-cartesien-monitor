export type EventItem = {
  id?: string;
  type: 'tag'|'start'|'end'|'join'|'leave'|'modeChange';
  roomId: string;
  ts: any; // Firestore Timestamp
  actorUid?: string;
  hunterUid?: string;
  victimUid?: string;
  payload?: any;
};
