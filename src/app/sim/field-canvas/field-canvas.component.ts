import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, input, signal, effect } from '@angular/core';

type BotLocal = { id: string; x: number; y: number; h: number|null };
type World = { minX:number; maxX:number; minY:number; maxY:number };

@Component({
  selector: 'app-field-canvas',
  standalone: true,
  templateUrl: './field-canvas.component.html',
})
export class FieldCanvasComponent implements AfterViewInit, OnDestroy {
  world = input<World>({ minX:-45,maxX:45,minY:-30,maxY:30 });
  bots  = input<BotLocal[]>([]);

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
    // bots (aperçu local)
    ctx.fillStyle = '#6aa0ff';
    for (const b of (this.bots()||[])) {
      const p = this.toCanvas(b.x, b.y);
      ctx.beginPath(); ctx.arc(p.cx, p.cy, 5.5, 0, Math.PI*2); ctx.fill();
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
