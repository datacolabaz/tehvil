import type { PropertyPassport, RealtorLead, RealtorListing } from '@workspace/api-client-react';

/* Realtor module copy (Azerbaijani, like the AI Smeta module). */

export const DEAL: Record<string, string> = { sale: 'Satış', rent: 'İcarə' };
export const DEAL_LEAD: Record<string, string> = { sale: 'Alqı', rent: 'İcarə' };
export const KIND: Record<string, string> = { apartment: 'Mənzil', villa: 'Villa', office: 'Ofis', country_house: 'Bağ evi', other: 'Digər' };
export const LISTING_STATUS: Record<string, string> = { active: 'Aktiv', pending: 'Gözləmədə', sold: 'Satılıb', archived: 'Arxiv' };
export const LISTING_TONE: Record<string, 'ok' | 'warn' | 'info' | 'neutral'> = { active: 'ok', pending: 'warn', sold: 'info', archived: 'neutral' };
export const LEAD_STATUS: Record<string, string> = { new: 'Yeni', contacted: 'Əlaqə saxlanıldı', interested: 'Maraqlıdır', meeting: 'Görüş planlandı', deal: 'Saziş', lost: 'İtirildi' };
export const LEAD_STATUSES = ['new', 'contacted', 'interested', 'meeting', 'deal', 'lost'] as const;
export const LEAD_TONE: Record<string, 'ok' | 'warn' | 'info' | 'neutral' | 'risk'> = { new: 'warn', contacted: 'info', interested: 'info', meeting: 'ok', deal: 'ok', lost: 'neutral' };
export const SOURCE: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', site: 'Sayt', brokly: 'Brokly', phone: 'Telefon', other: 'Digər' };
export const SOURCES = ['whatsapp', 'instagram', 'facebook', 'site', 'brokly', 'phone', 'other'] as const;
export const APPT_STATUS: Record<string, string> = { planned: 'Planlandı', done: 'Baş tutdu', cancelled: 'Ləğv edildi', rescheduled: 'Yenidən planlandı' };
export const APPT_TONE: Record<string, 'ok' | 'warn' | 'info' | 'neutral'> = { planned: 'info', done: 'ok', cancelled: 'neutral', rescheduled: 'warn' };
export const PORTAL: Record<string, string> = { brokly: 'Brokly.az', tap: 'Tap.az', bina: 'Bina.az', yeniemlak: 'Yeniemlak.az', instagram: 'Instagram', other: 'Digər portal' };
export const PASSPORT_STATUS: Record<string, string> = { draft: 'Qaralama', published: 'Dərc olunub', archived: 'Arxiv' };
export const HANDOVER: Record<string, string> = { pending: 'Qəbul gözləyir', accepted: 'Ev sahibi qəbul edib', revision: 'Düzəliş istənib' };

export type Trust = 'basic' | 'contractor' | 'handover';
export const TRUST: Record<Trust, { level: number; title: string; short: string; text: string }> = {
  basic: { level: 1, title: 'Əsas pasport', short: 'Əsas', text: 'Məlumatları realtor və ya ev sahibi yükləyib.' },
  contractor: { level: 2, title: 'Podratçı təsdiqli pasport', short: 'Podratçı təsdiqli', text: 'Podratçı hər işi “Bu işi mən görmüşəm” deyə təsdiqləyib.' },
  handover: { level: 3, title: 'Təhvil təsdiqli pasport', short: 'Təhvil təsdiqli', text: 'Ev sahibi hər mərhələni foto sübutla qəbul edib. Ən yüksək etibar səviyyəsi.' },
};

export const COPY = {
  position: 'Realtor üçün satış və etibar platforması',
  certified: 'Təhvil Sertifikatlı Mənzil',
  verifiedHistory: 'Yoxlanılmış təmir tarixçəsi',
  photoHandover: 'Foto sübutlu təhvil',
  triad: 'Alıcı güvənir, realtor fərqlənir, ev sahibi dəyər qazanır',
  qr: 'QR kodla təmir tarixçəsini yoxlayın',
  flow: 'Lead gəlir, cavab verilir, görüş planlaşır, mənzil etibarla satılır',
  pitch: 'Siz leadləri, elanları və görüşləri Təhvil.az-da idarə edirsiniz; hər mənzilinizi QR kodlu, foto sübutlu və ev sahibi təsdiqli “Təhvil Sertifikatlı Mənzil” kimi təqdim edirsiniz. Rəqibiniz yalnız satış prosesini idarə edir, siz həm satışı idarə edir, həm də alıcının güvənini qazanırsınız.',
};

const nf = new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 0 });
export const num = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
export const price = (p: number | null | undefined, cur = 'AZN') => (p == null ? 'Razılaşma ilə' : `${nf.format(p)} ${cur}`);
export const facts = (x: { rooms?: number | null; areaM2?: number | null; district?: string }) =>
  [x.district, x.rooms != null ? `${x.rooms} otaq` : '', x.areaM2 ? `${num(x.areaM2)} m²` : ''].filter(Boolean).join(' · ');

const tz = 'Asia/Baku';
/* Explicit Azerbaijani month names: some browsers ship without az locale data. */
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const baku = (iso: string) => {
  // Date-only values ("2026-03-02") are calendar dates, not instants.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [y, m, d] = iso.split('-').map(Number); return { y, m: m - 1, d, hh: 0, mm: 0 }; }
  const b = new Date(new Date(iso).getTime() + 4 * 3_600_000);
  return { y: b.getUTCFullYear(), m: b.getUTCMonth(), d: b.getUTCDate(), hh: b.getUTCHours(), mm: b.getUTCMinutes() };
};
const two = (n: number) => String(n).padStart(2, '0');
export const dateText = (iso?: string | null) => { if (!iso) return '—'; const x = baku(iso); return `${x.d} ${MONTHS[x.m]} ${x.y}`; };
export const dayShort = (iso: string) => { const x = baku(iso); return `${x.d} ${MONTHS[x.m]}`; };
export const timeText = (iso: string) => { const x = baku(iso); return `${two(x.hh)}:${two(x.mm)}`; };
export const dateTime = (iso?: string | null) => (iso ? `${dayShort(iso)}, ${timeText(iso)}` : '—');
export const dayKey = (d: Date) => { const x = baku(d.toISOString()); return `${x.y}-${two(x.m + 1)}-${two(x.d)}`; };
export function relative(iso?: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (Math.abs(m) < 1) return 'indicə';
  if (m > 0 && m < 60) return `${m} dəq əvvəl`;
  const h = Math.round(m / 60);
  if (m > 0 && h < 24) return `${h} saat əvvəl`;
  if (m < 0 && -m < 60) return `${-m} dəq sonra`;
  if (m < 0 && -h < 24) return `${-h} saat sonra`;
  return dateTime(iso);
}
/** <input type="datetime-local"> value in Baku time ↔ ISO instant. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 4 * 3_600_000);
  return d.toISOString().slice(0, 16);
}
export function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(`${v}:00+04:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizePhone(raw: string) {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = `994${d.slice(1)}`;
  if (d.length === 9) d = `994${d}`;
  return d;
}
export const waUrl = (phone: string, text: string) => {
  const d = normalizePhone(phone);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
};

export function passportUrl(publicId: string) { return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/p/${publicId}`; }
export const qrUrl = (publicId: string) => `${passportUrl(publicId)}?src=qr`;

/** Ready-made listing description (Elan üçün hazır təsvir). */
export function listingDescription(l: Pick<RealtorListing, 'title' | 'dealType' | 'propertyKind' | 'district' | 'rooms' | 'areaM2' | 'floor' | 'price' | 'currency'>, passportPublicId?: string | null) {
  const head = `${DEAL[l.dealType]} — ${l.title}`;
  const lines = [
    head,
    `📍 ${l.district}`,
    [l.rooms != null ? `${l.rooms} otaqlı ${KIND[l.propertyKind].toLowerCase()}` : KIND[l.propertyKind], l.areaM2 ? `${num(l.areaM2)} m²` : '', l.floor ? `${l.floor} mərtəbə` : ''].filter(Boolean).join(', '),
    `💰 ${price(l.price, l.currency)}`,
  ];
  if (passportPublicId) {
    lines.push('', '✅ Bu mənzil Təhvil Sertifikatlıdır. QR kod skan edərək təmir tarixçəsini, foto sübutları və təhvil statusunu yoxlaya bilərsiniz.', passportUrl(passportPublicId));
  }
  return lines.join('\n');
}

export function passportShareText(p: Pick<PropertyPassport, 'title' | 'district' | 'rooms' | 'areaM2' | 'price' | 'currency' | 'publicId' | 'trustLevel' | 'dealType'>) {
  return [
    `🏠 ${p.title}`,
    `${facts(p)} · ${price(p.price, p.currency)}`,
    '',
    `✅ ${COPY.certified} — ${TRUST[p.trustLevel as Trust].title}`,
    'Təmir tarixçəsini, foto sübutları və təhvil statusunu yoxlayın:',
    passportUrl(p.publicId),
  ].join('\n');
}

/* Suggested WhatsApp replies for manual mode. */
export function leadScripts(lead: RealtorLead, realtorName: string, matches: RealtorListing[]) {
  const first = lead.fullName.split(' ')[0];
  const listLines = matches.slice(0, 3).map((l, i) => `${i + 1}) ${l.title} — ${facts(l)} — ${price(l.price, l.currency)}${l.passportPublicId && l.passportStatus === 'published' ? `\n✅ Təhvil Sertifikatlı: ${passportUrl(l.passportPublicId)}` : ''}`).join('\n\n');
  return [
    { kind: 'question', label: 'İlk cavab və suallar', text: `Salam, ${first}! Mən ${realtorName}. Sizə ən uyğun mənzili tez tapmaq üçün qısa suallar:\n1) Alqı, yoxsa icarə?\n2) Hansı rayon?\n3) Büdcəniz?\n4) Neçə otaq?\n5) Nə vaxt almaq/köçmək istəyirsiniz?` },
    ...(matches.length ? [{ kind: 'listing', label: 'Uyğun elanları göndər', text: `${first}, sizin üçün seçdiyim variantlar:\n\n${listLines}` }] : []),
    { kind: 'slots', label: 'Görüş vaxtı təklif et', text: `${first}, mənzilə baxış üçün sabah 11:00 və ya 17:00 sizə uyğundurmu? Başqa vaxt da təklif edə bilərsiniz.` },
    { kind: 'follow_up', label: 'Follow-up', text: `Salam, ${first}! Mənzil axtarışınız hələ aktualdırmı? Yeni uyğun variantlar var — istəsəniz göndərim.` },
  ] as const;
}
