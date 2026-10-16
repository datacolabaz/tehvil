import type { PropertyPassport } from '@workspace/api-client-react';
import { qrDataUrl } from '@/components/realtor/ui';
import { TRUST, facts, price, qrUrl, type Trust } from './labels';

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; } else line = next;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** 1080×1920 Instagram story image: cover photo, certified seal, facts, QR and the realtor's brand. */
export async function storyImage(p: PropertyPassport): Promise<Blob> {
  await document.fonts?.ready;
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = (w: number, s: number) => `${w} ${s}px Manrope, 'DM Sans', system-ui, sans-serif`;

  ctx.fillStyle = '#173c33'; ctx.fillRect(0, 0, W, H);
  // Brand
  ctx.fillStyle = '#ddc899'; roundRect(ctx, 72, 84, 64, 64, 18); ctx.fill();
  ctx.fillStyle = '#173c33'; ctx.font = font(800, 42); ctx.fillText('t.', 86, 130);
  ctx.fillStyle = '#f7f4ea'; ctx.font = font(800, 40); ctx.fillText('Təhvil', 154, 130);
  ctx.font = font(600, 26); ctx.fillStyle = '#b9c8bd'; ctx.textAlign = 'right'; ctx.fillText('tehvil.az', W - 72, 128); ctx.textAlign = 'left';

  // Cover photo
  const cover = p.photos[0] ? await loadImage(p.photos[0].url) : null;
  const top = 196, ph = 820;
  ctx.save(); roundRect(ctx, 72, top, W - 144, ph, 40); ctx.clip();
  if (cover) {
    const scale = Math.max((W - 144) / cover.width, ph / cover.height);
    const w = cover.width * scale, h = cover.height * scale;
    ctx.drawImage(cover, 72 + (W - 144 - w) / 2, top + (ph - h) / 2, w, h);
  } else { ctx.fillStyle = '#21473d'; ctx.fillRect(72, top, W - 144, ph); }
  ctx.restore();

  // Seal
  const level = p.trustLevel as Trust;
  const sealY = top + ph - 70;
  ctx.fillStyle = level === 'handover' ? '#e8d29b' : '#f7f4ea'; roundRect(ctx, 112, sealY - 52, W - 224, 112, 28); ctx.fill();
  ctx.fillStyle = '#173c33'; ctx.font = font(800, 34); ctx.fillText('✓ TƏHVİL SERTİFİKATLI MƏNZİL', 150, sealY - 2);
  ctx.font = font(600, 26); ctx.fillStyle = '#3f6153'; ctx.fillText(`${TRUST[level].title} · ${TRUST[level].level}/3`, 150, sealY + 38);

  // Title and facts
  let y = top + ph + 110;
  ctx.fillStyle = '#f7f4ea'; ctx.font = font(800, 58);
  for (const line of wrap(ctx, p.title, W - 144, 2)) { ctx.fillText(line, 72, y); y += 70; }
  ctx.font = font(600, 34); ctx.fillStyle = '#cbd6cc'; ctx.fillText(facts(p), 72, y + 6);
  ctx.font = font(800, 50); ctx.fillStyle = '#ddc899'; ctx.fillText(price(p.price, p.currency), 72, y + 84);

  // QR card
  const qrSize = 300, qx = W - 72 - qrSize - 36, qy = H - 72 - qrSize - 92;
  ctx.fillStyle = '#ffffff'; roundRect(ctx, qx - 24, qy - 24, qrSize + 48, qrSize + 116, 30); ctx.fill();
  const qr = await loadImage(await qrDataUrl(qrUrl(p.publicId), qrSize * 2));
  if (qr) ctx.drawImage(qr, qx, qy, qrSize, qrSize);
  ctx.fillStyle = '#173c33'; ctx.font = font(700, 24); ctx.textAlign = 'center';
  ctx.fillText('Təmir tarixçəsini', qx + qrSize / 2, qy + qrSize + 42); ctx.fillText('QR kodla yoxlayın', qx + qrSize / 2, qy + qrSize + 74); ctx.textAlign = 'left';

  // Realtor
  const ry = H - 190;
  const avatar = p.realtor.photoUrl ? await loadImage(p.realtor.photoUrl) : null;
  if (avatar) { ctx.save(); ctx.beginPath(); ctx.arc(126, ry - 14, 54, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, 72, ry - 68, 108, 108); ctx.restore(); }
  const rx = avatar ? 202 : 72;
  ctx.fillStyle = '#f7f4ea'; ctx.font = font(800, 36); ctx.fillText(p.realtor.name, rx, ry - 20);
  ctx.fillStyle = '#b9c8bd'; ctx.font = font(600, 26);
  if (p.realtor.agency) ctx.fillText(p.realtor.agency.slice(0, 24), rx, ry + 18);
  const contact = p.realtor.whatsapp || p.realtor.phone;
  if (contact) ctx.fillText(contact.slice(0, 24), rx, ry + (p.realtor.agency ? 54 : 18));

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
