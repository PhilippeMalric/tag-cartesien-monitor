// src/app/pages/play/play.renderer.ts

import { RenderState } from "./play.models";


export class PlayRenderer {
 public draw = (target: HTMLCanvasElement | CanvasRenderingContext2D, state: any)=> {
    // --- Normalisation target → canvas + ctx
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null = null;

    if (typeof (target as any).getContext === 'function') {
      canvas = target as HTMLCanvasElement;
      ctx = canvas.getContext('2d');
    } else {
      ctx = target as CanvasRenderingContext2D;
      canvas = ctx.canvas;
    }
    if (!ctx) return;

    // --- Constantes UI
    const INVULN_DEFAULT_MS = 1000;
    const RING_OUTER = 14;
    const RING_INNER = 10;
    const RING_WIDTH = RING_OUTER - RING_INNER;

    // --- Helpers
    const epochToPerfDeadline = (deadlineEpochMs: number) =>
      performance.now() + Math.max(0, deadlineEpochMs - Date.now());

    const roleIsHunter = (r: any) => {
      const s = String(r ?? '').toLowerCase();
      return s === 'chasseur' || s === 'hunter';
    };

    // --- DPR + taille responsive
    const dpr = Math.max(1, Math.floor((globalThis as any).devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;

    // --- Couleurs via CSS vars
    const css = getComputedStyle(document.documentElement);
    const colorGrid       = css.getPropertyValue('--grid').trim()         || '#202124';
    const colorAxis       = css.getPropertyValue('--axis').trim()         || '#f0f1f3';
    const colorAxisStrong = css.getPropertyValue('--axis-strong').trim()  || colorAxis;
    const colorTick       = css.getPropertyValue('--tick').trim()         || '#ffffff';
    const labelStroke     = css.getPropertyValue('--label-stroke').trim() || 'rgba(0,0,0,0.65)';
    const colorSelf       = css.getPropertyValue('--self').trim()         || '#1976d2';
    const colorOther      = css.getPropertyValue('--other').trim()        || '#9aa0a6';
    const colorHunter     = css.getPropertyValue('--hunter').trim()       || '#ff7a00';
    const colorRing       = css.getPropertyValue('--tag-ring').trim()     || 'rgba(211,47,47,.35)';
    const invColRing      = css.getPropertyValue('--invuln-ring').trim()  || 'rgba(63,167,255,.85)';
    const invColFill      = css.getPropertyValue('--invuln-fill').trim()  || 'rgba(63,167,255,.15)';
    const invColText      = css.getPropertyValue('--invuln-text').trim()  || '#ffffff';

    ctx.clearRect(0, 0, w, h);

    // --- Espace (-50..50), échelle et centre
    const scale = Math.min(w, h) / 120;
    const cx = w / 2, cy = h / 2;

    // --- Grille
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = colorGrid;
    ctx.lineWidth = 1;
    for (let i = -50; i <= 50; i += 10) {
      const X = cx + i * scale;
      const Y = cy - i * scale;
      ctx.beginPath(); ctx.moveTo(cx - 50 * scale, Y); ctx.lineTo(cx + 50 * scale, Y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X, cy - 50 * scale); ctx.lineTo(X, cy + 50 * scale); ctx.stroke();
    }
    ctx.restore();

    // --- Axes
    ctx.strokeStyle = colorAxisStrong;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 50 * scale, cy); ctx.lineTo(cx + 50 * scale, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 50 * scale); ctx.lineTo(cx, cy + 50 * scale); ctx.stroke();

    // --- Texte avec halo
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const drawTextWithHalo = (text: string, x: number, y: number,
                              align: CanvasTextAlign, baseline: CanvasTextBaseline) => {
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.lineWidth = 3;
      ctx.strokeStyle = labelStroke;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colorTick;
      ctx.fillText(text, x, y);
    };
    for (let i = -50; i <= 50; i += 10) if (i !== 0) drawTextWithHalo(String(i), cx + i * scale, cy + 4, 'center', 'top');
    for (let i = -50; i <= 50; i += 10) if (i !== 0) drawTextWithHalo(String(i), cx - 4, cy - i * scale, 'right', 'middle');
    drawTextWithHalo('Y', cx - 2, cy - (55 * scale), 'right', 'middle');
    drawTextWithHalo('X', cx + (55 * scale), cy, 'center', 'alphabetic');

    // --- Helper: anneau d’invulnérabilité + timer
    const drawInvulnRing = (px: number, py: number, untilPerfMs: number,
                            labelSide: 'left' | 'right' | 'top' | 'bottom' = 'top') => {
      const now = performance.now();
      const left = Math.max(0, untilPerfMs - now);
      if (left <= 0) return;

      const frac = Math.max(0, Math.min(1, left / INVULN_DEFAULT_MS));

      ctx.beginPath();
      ctx.fillStyle = invColFill;
      ctx.arc(px, py, RING_OUTER, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = RING_WIDTH;
      ctx.strokeStyle = invColRing;
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * frac;
      ctx.beginPath();
      ctx.arc(px, py, (RING_INNER + RING_OUTER) / 2, start, end);
      ctx.stroke();
      ctx.restore();

      const secs = (left / 1000).toFixed(1);
      ctx.save();
      ctx.font = '600 11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = invColText;
      ctx.textAlign = (labelSide === 'left' ? 'right' : labelSide === 'right' ? 'left' : 'center');
      ctx.textBaseline = (labelSide === 'top' ? 'bottom' : labelSide === 'bottom' ? 'top' : 'middle');
      const off = 16;
      let tx = px, ty = py;
      if      (labelSide === 'left')   tx -= off;
      else if (labelSide === 'right')  tx += off;
      else if (labelSide === 'top')    ty -= off;
      else if (labelSide === 'bottom') ty += off;
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 4;
      ctx.fillText(`${secs}s`, tx, ty);
      ctx.restore();
    };

    // === Normalisation de l'état ===
    const role: string = state?.role ?? 'chassé';
    const tagRadius: number = Number(state?.tagRadius ?? 10); // 👈 rayon du tag

    // multi-chasseurs
    const hunterUids: string[] = Array.isArray(state?.hunterUids)
      ? state.hunterUids.filter((u: any) => typeof u === 'string')
      : [];

    // others : Map | Array<[id,obj]> | Record | fallback players/bots
    const othersEntries: Array<[string, any]> = [];
    if (state?.others) {
      const o = state.others;
      if (o instanceof Map)      othersEntries.push(...o.entries());
      else if (Array.isArray(o)) for (const it of o) if (Array.isArray(it) && it.length >= 2) othersEntries.push([String(it[0]), it[1]]);
      else if (typeof o === 'object') othersEntries.push(...Object.entries(o));
    }
    const pushFromArray = (arr: any[] | undefined, prefix = '') => {
      if (!Array.isArray(arr)) return;
      for (const it of arr) {
        const id = String(it?.id ?? it?.uid ?? (prefix + Math.random().toString(36).slice(2, 7)));
        othersEntries.push([id, {
          x: Number(it?.x ?? 0),
          y: Number(it?.y ?? 0),
          role: (it as any)?.role, // conserve le rôle si présent
        }]);
      }
    };
    if (othersEntries.length === 0) {
      pushFromArray(state?.players);
      pushFromArray(state?.bots, 'bot-');
    }

    // invuln globale optionnelle (epoch ms)
    const hunterGlobalIFrameUntilMs: number | undefined = (state as any)?.hunterIFrameUntilMs;

    // --- Dessin des autres
    for (const [uid, p] of othersEntries) {
      const isHunter = hunterUids.includes(uid) || roleIsHunter((p as any)?.role);
      const px = cx + Number(p?.x ?? 0) * scale;
      const py = cy - Number(p?.y ?? 0) * scale;

      // iFrame until (support number ms ou Timestamp-like)
      let untilMs: number | undefined;
      const raw = (p as any)?.iFrameUntilMs;
      if (typeof raw === 'number') {
        untilMs = raw;
      } else if (raw && typeof raw.seconds === 'number') {
        untilMs = (raw.seconds * 1000) + (raw.nanoseconds ? raw.nanoseconds / 1e6 : 0);
      } else if (isHunter && typeof hunterGlobalIFrameUntilMs === 'number') {
        untilMs = hunterGlobalIFrameUntilMs;
      }
      if (untilMs && untilMs > Date.now()) {
        drawInvulnRing(px, py, epochToPerfDeadline(untilMs), 'bottom');
      }

      // point
      ctx.fillStyle = isHunter ? colorHunter : colorOther;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();

      // 👇 Cercle de tag autour de CHAQUE chasseur
      if (isHunter && tagRadius > 0) {
        ctx.strokeStyle = colorRing;
        ctx.beginPath();
        ctx.arc(px, py, tagRadius * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };


}
