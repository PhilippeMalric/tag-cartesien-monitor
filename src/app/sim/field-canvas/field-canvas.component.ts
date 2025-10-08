import {
  AfterViewInit, Component, ElementRef, OnDestroy, ViewChild,
  effect, input, signal, inject, HostListener
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';

// 💡 adapte ce chemin au tien


import { World, Marker } from './field-canvas.model';
import { COLORS, colorForRole } from './field-canvas.theme';
import { resizeCanvasToDPR, setupResizeObserver } from './field-canvas.dpr';
import { PositionsService } from '../../services/positions.service';

@Component({
  selector: 'app-field-canvas',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './field-canvas.component.html',
})
export class FieldCanvasComponent implements AfterViewInit, OnDestroy {
  // ---- Inputs ----
  roomId = input<string>(''); // requis pour écouter RTDB joueurs + bots via PositionsService
  world  = input<World>({ minX: -45, maxX: 45, minY: -30, maxY: 30 });

  @ViewChild('cv', { static: true }) cvRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private raf: number | null = null;

  // ---- Services ----
  private readonly positions = inject(PositionsService);

  // ---- État ----
  private subs = new Subscription();
  private markers = signal<Marker[]>([]);
  private ro: ResizeObserver | null = null;

  constructor() {
    // Redessine quand le contexte est prêt ou quand markers/world changent
    effect(() => { if (this.ctx) this.frame(); });

    // Écoute RTDB via PositionsService.positions$ (fusion joueurs+bots) quand roomId change
    effect(() => {
      const id = (this.roomId() || '').trim();
      this.cleanupStreams();

      if (!id) {
        this.markers.set([]);
        return;
      }

      this.positions.startListening(id);

      const s = this.positions.positions$.subscribe((mapObj) => {
        // mapObj: Record<string, { x,y,t?,name?,role? }>
        const arr: Marker[] = Object.entries(mapObj || {}).map(([uid, p]) => ({
          id: uid,
          x: p.x,
          y: p.y,
          role: p.role ?? null,
          isBot: uid.startsWith('bot-'), // la fusion du service préfixe déjà les bots
        }));
        // debug visuel si besoin
        // console.debug('[FieldCanvas] markers:', arr.length, arr.slice(0,3));
        this.markers.set(arr);
      });

      this.subs.add(s);
    });
  }

  // ---- Cycle de vie ----
  ngAfterViewInit() {
    const ctx = this.cvRef.nativeElement.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D introuvable');
    this.ctx = ctx;

    // Hi-DPI + resize adaptatif
    const onResize = () => {
      resizeCanvasToDPR(this.cvRef.nativeElement);
    };
    resizeCanvasToDPR(this.cvRef.nativeElement);
    this.ro = setupResizeObserver(this.cvRef.nativeElement, onResize);
    if (!this.ro) onResize(); // fallback 1er passage

    this.frame();
  }

  ngOnDestroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.cleanupStreams();
    this.positions.stop();
    if (this.ro) this.ro.disconnect();
  }

  private cleanupStreams() {
    this.subs.unsubscribe();
    this.subs = new Subscription();
    this.markers.set([]);
  }

  // Fallback supplémentaire
  @HostListener('window:resize')
  onWinResize() {
    if (!this.ctx) return;
    resizeCanvasToDPR(this.cvRef.nativeElement);
  }

  // ---- Dessin principal ----
  private frame() {
    const ctx = this.ctx, cv = this.cvRef.nativeElement;

    // fond
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, cv.width, cv.height);

    // grille + axes + graduations
    this.drawGridWithTicks(5);

    // markers (couleur selon rôle, carré si bot)
    const items = this.markers();
    for (const m of items) {
      const c = colorForRole(m.role);
      const p = this.toCanvas(m.x, m.y);
      ctx.fillStyle = c.point;
      this.drawMarker(p.cx, p.cy, m.isBot, 7);
    }

    this.raf = requestAnimationFrame(() => this.frame());
  }

  // carré (bot) / cercle (humain)
  private drawMarker(cx: number, cy: number, isBot: boolean, r: number) {
    const ctx = this.ctx;
    if (isBot) {
      const d = r * 2;
      ctx.fillRect(Math.round(cx - r), Math.round(cy - r), d, d);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Grille + axes + graduations + labels tous les 10
  private drawGridWithTicks(step = 5) {
    const { minX, maxX, minY, maxY } = this.world();
    const ctx = this.ctx;

    // Grille
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
      const a = this.toCanvas(x, minY), b = this.toCanvas(x, maxY);
      ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
    }
    for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
      const a = this.toCanvas(minX, y), b = this.toCanvas(maxX, y);
      ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = COLORS.axes;
    ctx.lineWidth = 1.6;
    let a = this.toCanvas(0, minY), b = this.toCanvas(0, maxY);
    ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
    a = this.toCanvas(minX, 0); b = this.toCanvas(maxX, 0);
    ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();

    // Ticks + labels
    ctx.fillStyle = COLORS.ticks;
    ctx.strokeStyle = COLORS.ticks;
    ctx.lineWidth = 1;
    ctx.font = '12px system-ui, Arial, sans-serif';

    // Axe X (y=0)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
      const p = this.toCanvas(x, 0);
      const tick = (x % 10 === 0) ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(p.cx, p.cy - tick);
      ctx.lineTo(p.cx, p.cy + tick);
      ctx.stroke();
      if (x % 10 === 0 && x !== 0) {
        ctx.fillText(String(x), p.cx, p.cy + 8);
      }
    }

    // Axe Y (x=0)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
      const p = this.toCanvas(0, y);
      const tick = (y % 10 === 0) ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(p.cx - tick, p.cy);
      ctx.lineTo(p.cx + tick, p.cy);
      ctx.stroke();
      if (y % 10 === 0 && y !== 0) {
        ctx.fillText(String(y), p.cx - 10, p.cy);
      }
    }

    // Origine (0,0)
    const o = this.toCanvas(0, 0);
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('0', o.cx + 6, o.cy + 4);
  }

  private toCanvas(x: number, y: number) {
    const cv = this.cvRef.nativeElement;
    const { minX, maxX, minY, maxY } = this.world();
    const nx = (x - minX) / (maxX - minX);
    const ny = (y - minY) / (maxY - minY);
    return { cx: nx * cv.width, cy: cv.height - ny * cv.height };
  }
}
