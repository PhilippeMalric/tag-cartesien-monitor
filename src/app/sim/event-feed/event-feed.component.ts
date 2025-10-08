import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, Input, inject, signal } from '@angular/core';
import { DatePipe, AsyncPipe, NgClass, UpperCasePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

import { Subscription, tap } from 'rxjs';
import type { EventItem } from '../../models/monitor.models';
import { MonitorReadService } from '../../services/monitor-read.service';
import { BotService } from '../../services/bot.service';

@Component({
  selector: 'app-sim-event-feed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    // plus besoin de NgIf/NgFor — on utilise @if/@for (Angular ≥ v17)
    DatePipe, AsyncPipe, NgClass,
    MatCardModule, MatListModule, MatIconModule,
    MatButtonModule, MatChipsModule, MatTooltipModule, MatDividerModule,UpperCasePipe
  ],
  templateUrl: './event-feed.component.html',
  styleUrls: ['./event-feed.component.css'],
})
export class EventFeedComponent implements OnInit, OnDestroy {
  @Input() roomId?: string;

  private monitor = inject(MonitorReadService);
  private botService = inject(BotService);
  private sub?: Subscription;

  events = signal<EventItem[]>([]);
  loading = signal<boolean>(false);
  title = signal<string>('Événements (global)');

  ngOnInit(): void {
    this.startListening();
  }

  ngOnDestroy(): void {
    this.stopListening();
  }

  private startListening(): void {
    this.stopListening();

    if (this.roomId) {
      this.title.set(`Événements — Room ${this.roomId}`);
      const feed$ = this.monitor.events$(this.roomId, 50).pipe(tap((list:EventItem[]) => {
        console.log("list",list);
        if (list && list[0] != undefined && (list[0].id as string).startsWith('bot-')) {
        const x = rndInt(-50, 50);
        const y = rndInt(-50, 50);
        console.log("list[0]",list[0]);
        //ne semble pas produire deffet
        this.botService.setPos(this.roomId as string,list[0].id as string,x,y)
        }
      })
      );
      this.sub = feed$.subscribe(list => this.events.set(list));
    } else {
      this.title.set('Événements (global)');
      const feed$ = this.monitor.listenLatestGlobalEvents(100);
      this.sub = feed$.subscribe(list => this.events.set(list));
    }
  }

  private stopListening(): void {
    this.sub?.unsubscribe();
    this.sub = undefined;
    if (this.roomId) this.monitor.stopRoomEvents(this.roomId);
    else this.monitor.stopLatestGlobalEvents();
  }

  refresh(): void {
    this.startListening();
  }

  async loadMore(): Promise<void> {
    try {
      this.loading.set(true);
      if (this.roomId) {
        await this.monitor.loadMoreRoomEvents(this.roomId, 50);
      } else {
        await this.monitor.loadMoreLatestGlobalEvents(100);
      }
    } finally {
      this.loading.set(false);
    }
  }

  trackById = (_: number, ev: EventItem) => ev.id;

  iconFor(type?: string): string {
    switch ((type || '').toLowerCase()) {
      case 'tag': return 'bolt';
      default:    return 'event';
    }
  }

  chipColor(type?: string): 'primary' | 'accent' | 'warn' | undefined {
    switch ((type || '').toLowerCase()) {
      case 'tag': return 'warn';
      default:    return 'accent';
    }
  }

  titleFor(ev: EventItem): string {
    const t = (ev.type || '').toLowerCase();
    if (t === 'tag') {
      const h = (ev as any).hunterUid?.slice(0, 6) ?? '??????';
      const v = (ev as any).victimUid?.slice(0, 6) ?? '??????';
      return `${h} a tagué ${v}`;
    }
    return ev.type || 'Événement';
  }

  /** Retourne un timestamp (ms) à partir de "ts" (recommandé) avec fallback sur "at" */
  tsMs(ev: any): number | null {
    const src = ev?.ts ?? ev?.at ?? null;
    if (!src) return null;

    if (typeof src === 'number') return src;
    if (src?.toMillis) return src.toMillis();
    if (src instanceof Date) return src.getTime?.() ?? null;

    const t = new Date(src as any).getTime?.();
    return Number.isFinite(t) ? (t as number) : null;
  }

  /** Coordonnées présentes et valides */
  hasXY(ev: any): boolean {
    return Number.isFinite(ev?.x) && Number.isFinite(ev?.y);
  }
}

function rndInt(min: number, max: number): number {
  // bornes inclusives [-50, 50]
  return Math.floor(Math.random() * (max - min + 1)) + min;
}