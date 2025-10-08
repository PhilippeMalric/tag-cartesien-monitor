// src/app/sim/match-simulator/match-simulator.component.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';

import { RoomInputComponent } from '../../sim/room-input/room-input.component';
import { CreateRoomComponent } from '../../sim/create-room/create-room.component';
import { BotsControlsComponent } from '../../sim/bots-controls/bots-controls.component';
import { TagControlsComponent } from '../../sim/tag-controls/tag-controls.component';
import { FieldCanvasComponent } from '../../sim/field-canvas/field-canvas.component';
import { RoomSelectComponent } from '../../sim/room-select/room-select.component';
import { PlayersControlsComponent } from '../players-controls/players-controls.component';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { NumericPositionsComponent } from '../numeric-positions/numeric-positions.component';
import { EventFeedComponent } from '../event-feed/event-feed.component';

import { MatchSimStore } from '../match-sim.store';
import { displayMs, fmtTime, normalizeRole } from '../match-sim.utils';

@Component({
  selector: 'app-match-simulator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    MatCardModule, MatSnackBarModule, MatDividerModule,
    RoomInputComponent, CreateRoomComponent,
    BotsControlsComponent, TagControlsComponent, FieldCanvasComponent,
    RoomSelectComponent, PlayersControlsComponent, MatChipsModule,
    MatIcon, MatProgressBarModule, NumericPositionsComponent, EventFeedComponent
  ],
  templateUrl: './match-simulator.component.html',
  styleUrls: ['./match-simulator.component.css'],
})
export class MatchSimulatorComponent {
  // Store (toute la logique/état)
  readonly store = inject(MatchSimStore);

  // Helpers utilisés en template (on les ré-exporte)
  readonly displayMs = displayMs;
  readonly fmtTime = fmtTime;
  readonly normalizeRole = normalizeRole;

  // Facilité d’accès dans le template (syntaxe lisible)
  readonly newRoomName = this.store.newRoomName;
  readonly roomId = this.store.roomId;
  readonly nbBots = this.store.nbBots;
  readonly speed = this.store.speed;
  readonly victimUid = this.store.victimUid;
  readonly bots = this.store.bots;
  readonly phaseSig = this.store.phaseSig;
  readonly gameStarted = this.store.gameStarted;
  readonly roomDocSig = this.store.roomDocSig;
  readonly statusSig = this.store.statusSig;
  readonly dots$ = this.store.dots$;

  // Actions déléguées
  createRoomAndUseIt = () => this.store.createRoomAndUseIt();
  listen = () => this.store.listen();
  unlisten = () => this.store.unlisten();
  spawnBots = (role?: string) => this.store.spawnBots(role);
  start = () => this.store.start();
  stop = () => this.store.stop();
  simulateTag = (dots: any[]) => this.store.simulateTag(dots);
}
