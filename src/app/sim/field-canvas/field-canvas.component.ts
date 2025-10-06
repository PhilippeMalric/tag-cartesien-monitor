// field-canvas.component.ts
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, input, signal, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

type Phase = 'pre' | 'running';             // ⬅️ ajoute ce type
type BotLocal = { id: string; x: number; y: number; h: number|null; spawn?: {x:number;y:number} };
type World = { minX:number; maxX:number; minY:number; maxY:number };

@Component({
  selector: 'app-field-canvas',
  standalone: true,
  imports: [ FieldCanvasComponent,MatIconModule],
  templateUrl: './field-canvas.component.html',
})
export class FieldCanvasComponent implements AfterViewInit, OnDestroy {
  world = input<World>({ minX:-45,maxX:45,minY:-30,maxY:30 });
  bots  = input<BotLocal[]>([]);
  phase = input<Phase>('pre');              // ⬅️ NOUVEL INPUT

  @ViewChild('cv', { static: true }) cvRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private raf: number | null = null;

  constructor() {
    effect(() => { if (this.ctx) this.frame(); });
  }

  ngAfterViewInit() {
    const ctx = this.cvRef.nativeElement.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D introuvable');
    this.ctx = ctx;
    this.frame();
  }
  ngOnDestroy(){ if (this.raf) cancelAnimationFrame(this.raf); }

  private frame(){
    const ctx = this.ctx, cv = this.cvRef.nativeElement;

    // fond
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle = '#10151c'; ctx.fillRect(0,0,cv.width,cv.height);

    // grille
    this.drawGrid(5);

    // dessin selon phase
    const bots = this.bots() || [];
    const phase = this.phase();             // ⬅️ lit l'input phase

    if (phase === 'pre') {
      // spawns (vert)
      ctx.fillStyle = '#55d68a';
      for (const b of bots) {
        const sx = b.spawn?.x ?? b.x;
        const sy = b.spawn?.y ?? b.y;
        const p = this.toCanvas(sx, sy);
        ctx.beginPath(); ctx.arc(p.cx, p.cy, 5, 0, Math.PI*2); ctx.fill();
      }
    } else {
      // positions (bleu) + spawn en filigrane
      for (const b of bots) {
        if (b.spawn) {
          const sp = this.toCanvas(b.spawn.x, b.spawn.y);
          ctx.fillStyle = 'rgba(143,163,191,0.55)';
          ctx.beginPath(); ctx.arc(sp.cx, sp.cy, 4, 0, Math.PI*2); ctx.fill();
        }
        const pp = this.toCanvas(b.x, b.y);
        ctx.fillStyle = '#6aa0ff';
        ctx.beginPath(); ctx.arc(pp.cx, pp.cy, 6, 0, Math.PI*2); ctx.fill();
        if (b.spawn) {
          const sp = this.toCanvas(b.spawn.x, b.spawn.y);
          ctx.strokeStyle = 'rgba(106,160,255,0.6)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(sp.cx, sp.cy); ctx.lineTo(pp.cx, pp.cy); ctx.stroke();
        }
      }
    }

    this.raf = requestAnimationFrame(()=>this.frame());
  }

  private drawGrid(step=5){
    const {minX,maxX,minY,maxY} = this.world();
    const ctx = this.ctx;
    ctx.strokeStyle='#223043'; ctx.lineWidth=1;
    for(let x=Math.ceil(minX/step)*step; x<=maxX; x+=step){
      const a=this.toCanvas(x,minY), b=this.toCanvas(x,maxY);
      ctx.beginPath(); ctx.moveTo(a.cx,a.cy); ctx.lineTo(b.cx,b.cy); ctx.stroke();
    }
    for(let y=Math.ceil(minY/step)*step; y<=maxY; y+=step){
      const a=this.toCanvas(minX,y), b=this.toCanvas(maxX,y);
      ctx.beginPath(); ctx.moveTo(a.cx,a.cy); ctx.lineTo(b.cx,b.cy); ctx.stroke();
    }
    ctx.strokeStyle='#8fa3bf'; ctx.lineWidth=1.4;
    let a=this.toCanvas(0,minY), b=this.toCanvas(0,maxY);
    ctx.beginPath(); ctx.moveTo(a.cx,a.cy); ctx.lineTo(b.cx,b.cy); ctx.stroke();
    a=this.toCanvas(minX,0), b=this.toCanvas(maxX,0);
    ctx.beginPath(); ctx.moveTo(a.cx,a.cy); ctx.lineTo(b.cx,b.cy); ctx.stroke();
  }

  private toCanvas(x:number,y:number){
    const cv=this.cvRef.nativeElement;
    const {minX,maxX,minY,maxY} = this.world();
    const nx = (x - minX) / (maxX - minX);
    const ny = (y - minY) / (maxY - minY);
    return { cx: nx * cv.width, cy: cv.height - ny * cv.height };
  }
}
