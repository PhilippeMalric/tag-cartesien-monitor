// Modèle MONITOR (pas celui du jeu)
export type GameMode = 'classic' | 'transmission' | 'infection';

export type RoomState = 'idle' | 'running' | 'in-progress' | 'ended';

export interface RoomDoc {
  id?: string;
  ownerUid: string;
  state: RoomState;
  mode: GameMode;
  targetScore?: number;   // utilisé pour classic
  timeLimit?: number;     // optionnel (secondes)
  players?: number;
  createdAt?: any;
  updatedAt?: any;
  roles:any[];
  roundEndAtMs?:any
  hunterUid?:string;
  name?: string;
  lastEventAt?: any;  // Timestamp
}

export type RoomVM = RoomDoc & {
  id: string;
  /** lastEventAt converti en Date (pour |date) */
  lastEventAt?: Date | null;
  /** uids dérivés pour l’affichage */
    uids: string[];
};
