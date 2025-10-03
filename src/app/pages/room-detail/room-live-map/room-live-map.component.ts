import {
  Component, ElementRef, ViewChild, OnDestroy, OnInit, inject, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { PosDTO, PositionsService } from '../../../services/positions.service';
import { PlayRenderer } from '../play.renderer';
import { MonitorService } from '../../../services/monitor.service';

// Adapte ces chemins selon ton repo


@Component({
  standalone: true,
  selector: 'app-room-live-map',
  imports: [CommonModule],
  templateUrl: './room-live-map.component.html',
  styleUrls: ['./room-live-map.component.scss'],
})
export class RoomLiveMapComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private ngZone = inject(NgZone);
  private positions: PositionsService = inject(PositionsService);
  private monitor = inject(MonitorService);
private hunterUids: string[] = [];

  @ViewChild('cv', { static: true }) cv!: ElementRef<HTMLCanvasElement>;

  private roomId!: string;
  private raf = 0;
  private ctx!: CanvasRenderingContext2D;
  private renderer = new PlayRenderer();

  // cache live des positions (uid → {x,y,...})
  private latest: Record<string, PosDTO> = {};
  private rendererWantsCanvas?: boolean; // cache le mode après 1er essai


  ngOnInit() {
    this.roomId = this.route.snapshot.paramMap.get('id')!;
    this.positions.startListening(this.roomId);

    const canvas = this.cv.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;

    this.positions.positions$.subscribe((map: Record<string, PosDTO> | null) => {
  this.latest = map ?? {};

  // dérive la liste des chasseurs d'après role
  const hunters: string[] = [];
  for (const [id, p] of Object.entries(this.latest)) {
    const role = String(p?.role ?? '').toLowerCase();
    if (role === 'chasseur' || role === 'hunter') hunters.push(id);
  }
  this.hunterUids = Array.from(new Set(hunters));
  

  if (!this.raf) this.raf = requestAnimationFrame(() => this.draw());
});

    this.ngZone.runOutsideAngular(() => this.loop());
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
    this.positions?.stop?.();
  }

  private loop = () => {
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  roleIsHunter = (r: any) => {
    const s = String(r ?? '').toLowerCase();
    return s === 'chasseur' || s === 'hunter';
  };

  private draw() {
    const canvas = this.cv.nativeElement;

    // DPR & resize
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
    }

    // === Build RenderState ===
    const now = performance.now();
    const bounds = { minX: -50, maxX: 50, minY: -50, maxY: 50 };

    const players: Array<{ id: string; x: number; y: number; name?: string }> = [];
    const bots   : Array<{ id: string; x: number; y: number; name?: string }> = [];

    for (const [id, p] of Object.entries(this.latest)) {
      if (!p) continue;
      const item = {
        id,
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
        name: p.name,
        role: p.role, // ⬅️ on passe le rôle au renderer
      };
      (id.startsWith('bot-') ? bots : players).push(item);
    }

    const state: any = {
      now,
      bounds,
      grid: { show: true, step: 10 },
      players,
      bots,
      showSelf: false,
      hunterUids: this.hunterUids, // ⬅️ multi chasseurs depuis roles live
      tagRadius: 10, 
    };



    // 
    try {
     
        // On sait déjà qu'il veut un ctx
        console.log('PlayRenderer: using ctx');
        this.renderer.draw(this.ctx, state)
        
        
      } 
   catch {
     console.log('PlayRenderer: fallback to quick draw');
     
    }
  }

}
