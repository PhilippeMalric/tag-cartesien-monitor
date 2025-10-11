import { RoomDoc } from '@tag/types';

export type { GameMode, RoomDoc, Role, RolesMap } from '@tag/types';

// Optionnel : ViewModel UI spécifique à l’app (exemple)
export interface RoomVM {
  id: string;
  doc: RoomDoc;
  lastEventAt?: Date | null;
}

export type RoomWithId = RoomDoc & { id: string };