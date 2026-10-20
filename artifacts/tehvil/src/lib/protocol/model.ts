import { addProtocolMedia, requestUploadUrl } from '@workspace/api-client-react';

export type Role = 'realtor' | 'seller' | 'buyer';
export type Status = 'draft' | 'collecting' | 'awaiting' | 'approved' | 'finalized';
export type Condition = 'good' | 'fair' | 'defective';
export interface Meter { value: string; note: string; mediaIds: string[] }
export interface Extras { meters: { water: Meter; gas: Meter; electric: Meter }; keys: { kind: string; count: number }[]; notes: string }
export interface Protocol {
  id: string; number: string; address: string; propertyType: string; handoverDate: string | null; status: Status; creatorRole: Role;
  sellerName: string; sellerPhone: string; buyerName: string; buyerPhone: string; realtorName: string; realtorPhone: string;
  extras: Extras; revision: number; currentVersion: number; createdAt: string; updatedAt: string;
}
export interface Room { id: string; name: string; kind: string; condition: Condition | null; note: string; position: number }
export interface Defect { id: string; roomId: string | null; text: string; createdAt: string }
export interface Media { id: string; roomId: string | null; defectId: string | null; target: string; meterKind: string | null; caption: string; contentType: string; url: string; createdAt: string }
export interface Detail {
  protocol: Protocol; rooms: Room[]; defects: Defect[]; media: Media[];
  participants: { role: Role; joinedAt: string; isMe: boolean; isCreator: boolean }[];
  invites: { id: string; role: Role; createdAt: string; used: boolean; lastOpenedAt: string | null }[];
  versions: { version: number; contentHash: string; createdAt: string; hasPdf: boolean; pdfCreatedAt: string | null }[];
  approvals: { version: number; role: Role; decision: 'approved' | 'changes'; comment: string; authLevel: string; createdAt: string }[];
  events: { action: string; role: Role | null; detail: Record<string, unknown>; createdAt: string }[];
  me: { role: Role | null; isCreator: boolean; canEdit: boolean; canDecide: boolean; current: { version: number; contentHash: string } | null };
}
export const asDetail = (x: unknown) => x as Detail;

export const ROLE_LABEL: Record<Role, string> = { realtor: 'Rieltor', seller: 'Ev sahibi (satıcı)', buyer: 'Alıcı' };
export const ROLE_SHORT: Record<Role, string> = { realtor: 'rieltor', seller: 'satıcı', buyer: 'alıcı' };
export const STATUS_LABEL: Record<Status, string> = { draft: 'Qaralama', collecting: 'Məlumatlar toplanır', awaiting: 'Təsdiq gözləyir', approved: 'Təsdiqlənib', finalized: 'Yekun protokol yaradılıb' };
export const STATUS_TONE: Record<Status, 'neutral' | 'info' | 'warn' | 'ok'> = { draft: 'neutral', collecting: 'info', awaiting: 'warn', approved: 'ok', finalized: 'ok' };
export const CONDITION_LABEL: Record<Condition, string> = { good: 'Yaxşı', fair: 'Qənaətbəxş', defective: 'Qüsurlu' };
export const PROPERTY_LABEL: Record<string, string> = { apartment: 'Mənzil', house: 'Fərdi ev', other: 'Digər' };
export const METER_LABEL: Record<'water' | 'gas' | 'electric', string> = { water: 'Su sayğacı', gas: 'Qaz sayğacı', electric: 'Elektrik sayğacı' };
export const ROOM_KINDS: [string, string][] = [['living', 'Qonaq otağı'], ['bed', 'Yataq otağı'], ['kitchen', 'Mətbəx'], ['bath', 'Hamam və tualet'], ['hall', 'Dəhliz'], ['balcony', 'Balkon'], ['other', 'Digər']];
export const EVENT_LABEL: Record<string, string> = {
  created: 'Protokol yaradıldı', joined: 'Protokola qoşuldu', invite_created: 'Dəvət linki yaradıldı', invite_revoked: 'Dəvət linki ləğv edildi', details_updated: 'Məlumatlar yeniləndi',
  room_removed: 'Otaq silindi', submitted: 'Təsdiqə göndərildi', approved: 'Təsdiq etdi', changes_requested: 'Düzəliş istədi', fully_approved: 'Hər iki tərəf təsdiq etdi',
  reopened: 'Redaktə yenidən açıldı', pdf_created: 'PDF yaradıldı', archived: 'Arxivə göndərildi',
};
export const errorText = (e: unknown, fallback = 'Alınmadı. Yenidən cəhd edin.') => (e as { data?: { error?: string } })?.data?.error ?? fallback;
export const dayAz = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');
const BAKU = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baku', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
/** dd.mm.yyyy HH:MM in Baku time, whatever the phone's time zone. */
export const timeAz = (iso: string) => BAKU.format(new Date(iso)).replace(/\//g, '.').replace(',', '');

/** A room counts as done when its condition is chosen; a defective room also needs a defect or a photo. */
export function roomDone(d: Detail, r: Room) {
  if (!r.condition) return false;
  if (r.condition !== 'defective') return true;
  return d.defects.some((x) => x.roomId === r.id) || d.media.some((m) => m.roomId === r.id);
}

/** WhatsApp link: to a number when we have one, otherwise the share sheet. */
export function waLink(text: string, phone?: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  const to = digits.length >= 9 ? (digits.startsWith('994') ? digits : digits.startsWith('0') ? `994${digits.slice(1)}` : digits.length === 9 ? `994${digits}` : digits) : '';
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/* ------------------------------------------------------------------ photos */

const MAX_EDGE = 2000;
export class PhotoError extends Error {}

/** Phone photos are turned into a JPEG of at most 2000 px — enough to see a crack, small enough for mobile data. */
export async function preparePhoto(file: File): Promise<File> {
  const okType = /^image\//.test(file.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
  if (!okType) throw new PhotoError('Bu fayl şəkil deyil. Foto seçin.');
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 2_500_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('encode');
    return new File([blob], (file.name.replace(/\.\w+$/, '') || 'foto') + '.jpg', { type: 'image/jpeg' });
  } catch {
    if (file.type === 'image/jpeg' || file.type === 'image/png') return file;
    throw new PhotoError('Bu foto formatı açılmadı. Kameranın parametrlərində “Ən uyğun” (JPEG) formatını seçin və ya başqa foto seçin.');
  }
}

export interface PhotoTarget { target: 'room' | 'defect' | 'meter' | 'keys' | 'other'; roomId?: string | null; defectId?: string | null; meterKind?: 'water' | 'gas' | 'electric' | null; caption?: string }

/** Upload one prepared photo and attach it. Throws PhotoError with a message the person can act on. */
export async function uploadPhoto(protocolId: string, file: File, t: PhotoTarget): Promise<Detail> {
  if (file.size > 15 * 1024 * 1024) throw new PhotoError('Foto çox böyükdür (15 MB-dan çox).');
  let meta;
  try { meta = await requestUploadUrl({ name: file.name, size: file.size, contentType: file.type }); }
  catch { throw new PhotoError('Foto yüklənmədi. İnternet bağlantısını yoxlayıb yenidən cəhd edin.'); }
  const put = await fetch(meta.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }).catch(() => null);
  if (!put?.ok) throw new PhotoError('Foto yüklənmədi. Yenidən cəhd edin.');
  try {
    return asDetail(await addProtocolMedia(protocolId, { files: [{ objectPath: meta.objectPath, originalName: file.name, contentType: file.type, size: file.size }], target: t.target, roomId: t.roomId ?? null, defectId: t.defectId ?? null, meterKind: t.meterKind ?? null, caption: t.caption ?? '' }));
  } catch (e) { throw new PhotoError(errorText(e, 'Foto saxlanılmadı. Yenidən cəhd edin.')); }
}
