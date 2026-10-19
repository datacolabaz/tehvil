import type { QueryClient } from '@tanstack/react-query';

/** Azerbaijani labels for the digital home passport (like the Smeta and Realtor modules). */

export const PROPERTY: Record<string, string> = { apartment: 'Mənzil', house: 'Həyət evi', villa: 'Villa', office: 'Ofis', commercial: 'Obyekt', other: 'Digər' };
/** The three choices shown when a home is added; the rest stay valid for older records. */
export const PROPERTY_SIMPLE: [string, string][] = [['apartment', 'Mənzil'], ['house', 'Həyət evi'], ['other', 'Digər']];
export const STAGE: Record<string, string> = { construction: 'Tikilir', renovation: 'Təmirdədir', living: 'Yaşayış üçün hazırdır' };
export const HOME_ROLE: Record<string, string> = { owner: 'Ev sahibi', member: 'İdarə edir', contributor: 'Redaktə edə bilər', technician: 'Redaktə edə bilər', viewer: 'Yalnız baxa bilər', performer: 'Usta', staff: 'Tehvil.az əməkdaşı' };
/** One sentence per access level, shown wherever access is given. */
export const HOME_ROLE_HINT: Record<string, string> = {
  member: 'Evi sizinlə birlikdə idarə edir: işləri, otaqları, məlumatları. Paylaşım və giriş icazələri yalnız sizdə qalır.',
  contributor: 'İş, foto, fayl, texniki məlumat və avadanlıq əlavə edə və dəyişə bilər. Paylaşım və giriş verə bilməz.',
  viewer: 'Evin məlumatlarına yalnız baxa bilər, heç nə dəyişə bilməz.',
};

export const ROOM_KIND: Record<string, string> = { living: 'Qonaq otağı', bedroom: 'Yataq otağı', kitchen: 'Mətbəx', bathroom: 'Hamam', toilet: 'Tualet', hall: 'Dəhliz', balcony: 'Balkon', utility: 'Texniki otaq', other: 'Digər' };
export const ROOM_CONDITION: Record<string, string> = { good: 'Yaxşı vəziyyətdə', needs_repair: 'Təmir lazımdır', in_progress: 'Təmirdədir', unknown: 'Qeyd edilməyib' };

/**
 * "Hansı iş görülüb?" — the quick choices come first, in this order. New kinds of work are added
 * here (and to the API enum); everything else reads the labels from this map.
 */
export const WORK_CATEGORY: Record<string, string> = {
  electrical: 'Elektrik işi', plumbing: 'Santexnika', waterproofing: 'Su izolyasiyası', plaster: 'Suvaq', painting: 'Boya', flooring: 'Döşəmə',
  doors_windows: 'Qapı və pəncərə', heating: 'İstilik sistemi', hvac: 'Kondisioner', other: 'Digər',
  sewer: 'Kanalizasiya', tiling: 'Kafel', drywall: 'Alçıpan', welding: 'Qaynaq', carpentry: 'Dülgərlik / mebel', roofing: 'Dam', insulation: 'İzolyasiya', general: 'Ümumi təmir',
};
export const QUICK_CATEGORIES = ['electrical', 'plumbing', 'waterproofing', 'plaster', 'painting', 'flooring', 'doors_windows', 'heating', 'hvac', 'other'];
export const WORK_KIND: Record<string, string> = { construction: 'Tikinti', renovation: 'Təmir', installation: 'Quraşdırma', maintenance: 'Baxım və təmir', repair: 'Nasazlığın aradan qaldırılması', inspection: 'Yoxlama' };
export const WORK_STATUS: Record<string, string> = { planned: 'Planlaşdırılır', in_progress: 'Davam edir', completed: 'Görülüb — təsdiqinizi gözləyir', confirmed: 'Görülüb', revision: 'Düzəliş istənib' };
export const WORK_TONE: Record<string, 'ok' | 'warn' | 'info' | 'neutral' | 'risk'> = { planned: 'neutral', in_progress: 'info', completed: 'warn', confirmed: 'ok', revision: 'risk' };

export const PART_ROLE: Record<string, string> = { lead: 'Əsas usta', team_lead: 'Briqadir', team_member: 'Briqada üzvü', assistant: 'Köməkçi', supervisor: 'Nəzarətçi', inspector: 'Yoxlayan mütəxəssis' };
export const PART_ROLES = ['lead', 'team_lead', 'team_member', 'assistant', 'supervisor', 'inspector'] as const;
export const PART_STATUS: Record<string, string> = { invited: 'Cavab gözlənilir', accepted: 'İşdə iştirakını təsdiqləyib', declined: 'İmtina edib', removed: 'İşdən çıxarılıb', recorded: 'Hesabı yoxdur (ev sahibinin qeydi)' };
export const PART_TONE: Record<string, 'ok' | 'warn' | 'info' | 'neutral' | 'risk'> = { invited: 'warn', accepted: 'ok', declined: 'neutral', removed: 'neutral', recorded: 'info' };

export const WORKER_KIND: Record<string, string> = { individual: 'Usta', team: 'Briqada', company: 'Şirkət' };
export const MEMBER_ROLE: Record<string, string> = { leader: 'Briqadir', member: 'Üzv', representative: 'Şirkət nümayəndəsi' };
export const MEMBER_STATUS: Record<string, string> = { invited: 'Dəvət olunub', active: 'Aktiv', declined: 'İmtina edib', left: 'Ayrılıb', removed: 'Çıxarılıb' };

export const NOTE_KIND: Record<string, string> = { note: 'Qeyd', defect: 'Problem / qüsur', fix: 'Problem düzəldildi', inspection: 'Mütəxəssis yoxlaması' };
export const PHASE: Record<string, string> = { before: 'İşdən əvvəl', during: 'İş zamanı', after: 'İşdən sonra', hidden: 'Divar bağlanmazdan əvvəl', other: 'Fayl', document: 'Sənəd' };

export const INFRA_TYPE: Record<string, string> = { electric: 'Elektrik xətləri', water: 'Su xətləri', sewer: 'Kanalizasiya', heating: 'İstilik xətləri', gas: 'Qaz xətti', ventilation: 'Ventilyasiya', internet: 'İnternet və TV kabeli', meter: 'Sayğac', valve: 'Ventil / kran', electrical_panel: 'Elektrik lövhəsi', other: 'Digər' };
export const INFRA_COLOR: Record<string, string> = { meter: '#8a6a2c', valve: '#1f6f8b', electrical_panel: '#b5651d', electric: '#e0a100', water: '#2477d6', sewer: '#7a5230', heating: '#d6452a', gas: '#e6c419', ventilation: '#3aa39a', internet: '#7b4fd6', other: '#5b6b66' };
export const INFRA_SOURCE: Record<string, string> = { owner: 'Ev sahibi qeyd edib', worker: 'Usta qeyd edib', plan: 'Plandan / layihədən', specialist: 'Mütəxəssis qeyd edib' };

export const EQUIP_CATEGORY: Record<string, string> = { boiler: 'Kombi', air_conditioner: 'Kondisioner', water_filter: 'Su filtri', water_heater: 'Su qızdırıcısı', electrical_panel: 'Elektrik paneli', ventilation: 'Ventilyasiya', appliance: 'Məişət texnikası', other: 'Digər' };

export const SHARE_LEVEL: Record<string, string> = { selected: 'Seçdiyim məlumatlar', technical: 'Tam məlumatlar' };
export const PUBLIC_LEVEL: Record<string, string> = { off: 'Heç nə göstərmə', basic: 'Evin ümumi məlumatları', history: 'Ümumi məlumat + təsdiqlənmiş işlər' };

export const AUDIT_ACTION: Record<string, string> = {
  'home.created': 'Ev əlavə olundu', 'home.updated': 'Evin məlumatları dəyişdi', 'home.archived': 'Ev arxivləndi',
  'room.created': 'Otaq əlavə olundu', 'room.updated': 'Otaq dəyişdi', 'room.deleted': 'Otaq silindi',
  'work.created': 'Görülən iş əlavə olundu', 'work.updated': 'Görülən iş dəyişdi', 'work.updated_after_confirmation': 'Təsdiqdən sonra dəyişiklik',
  'work.start': 'İş başladı', 'work.complete': 'İş tamamlandı', 'work.confirm': 'Ev sahibi təsdiqlədi', 'work.request_revision': 'Düzəliş istəndi', 'work.reopen': 'İş yenidən açıldı',
  'participant.invited': 'Usta işə dəvət olundu', 'participant.recorded': 'Hesabı olmayan usta qeyd olundu', 'participant.accepted': 'Usta iştirakını təsdiqlədi',
  'participant.declined': 'Usta imtina etdi', 'participant.removed': 'Usta işdən çıxarıldı', 'participant.updated': 'Ustanın rolu və ya icazəsi dəyişdi', 'placeholder.claimed': 'Usta qeydi onun öz hesabına bağlandı',
  'note.note': 'Qeyd', 'note.defect': 'Nasazlıq qeydi', 'note.fix': 'Düzəliş qeydi', 'note.inspection': 'Texniki yoxlama',
  'media.added': 'Foto / video əlavə olundu', 'media.hidden': 'Fayl gizlədildi',
  'infrastructure.created': 'Evdəki sistem qeyd olundu', 'infrastructure.updated': 'Evdəki sistem dəyişdi', 'infrastructure.deleted': 'Evdəki sistem silindi', 'infrastructure.verified': 'Mütəxəssis təsdiqlədi',
  'equipment.created': 'Avadanlıq əlavə olundu', 'equipment.updated': 'Avadanlıq dəyişdi', 'equipment.deleted': 'Avadanlıq silindi',
  'invitation.created': 'Dəvət linki yaradıldı', 'smeta.linked': 'Smeta evdə saxlanıldı', 'smeta.unlinked': 'Smeta evdən çıxarıldı', 'member.joined': 'Üzv qoşuldu', 'member.removed': 'Üzv çıxarıldı',
  'sharing.updated': 'QR kodla baxış ayarları dəyişdi', 'share.created': 'Paylaşım linki yaradıldı', 'share.revoked': 'Paylaşım linki bağlandı',
  'review.created': 'Rəy yazıldı', 'review.reported': 'Rəyə etiraz edildi', 'review.hidden': 'Rəy gizlədildi', 'review.restored': 'Rəy bərpa olundu',
};

const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
/** dd mon yyyy for a date (yyyy-mm-dd) or ISO timestamp, Baku time. */
export function day(v?: string | null) {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; }
  const x = new Date(new Date(v).getTime() + 4 * 3600_000);
  return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}
export function dayTime(v?: string | null) {
  if (!v) return '—';
  const x = new Date(new Date(v).getTime() + 4 * 3600_000);
  return `${day(v)}, ${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`;
}
export const range = (a?: string | null, b?: string | null) => (a && b ? `${day(a)} – ${day(b)}` : a ? `${day(a)}-dən` : b ? `${day(b)}-dək` : 'Tarix qeyd edilməyib');
export const today = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);

const base = () => import.meta.env.BASE_URL.replace(/\/$/, '');
export const publicHomeUrl = (publicId: string) => `${window.location.origin}${base()}/h/${publicId}`;
export const workerPublicUrl = (id: string) => `${window.location.origin}${base()}/w/${id}`;

/** Every query of the home passport (keys are the request URLs). */
export function refreshHomeData(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: q => /^\/api\/(homes|works|me|workers|equipment|infrastructure|home-media|public)/.test(String(q.queryKey[0])) });
}

/** Keeps an unfinished form in this browser so a closed tab or lost connection does not lose it. */
export function loadDraft<T>(key: string): T | null {
  try { const v = localStorage.getItem(`tehvil-draft:${key}`); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
export function saveDraft(key: string, value: unknown) { try { localStorage.setItem(`tehvil-draft:${key}`, JSON.stringify(value)); } catch { /* storage unavailable */ } }
export function clearDraft(key: string) { try { localStorage.removeItem(`tehvil-draft:${key}`); } catch { /* storage unavailable */ } }

export const CURRENCY = ['AZN', 'USD', 'EUR'] as const;
export const money = (v: number | null | undefined, c = 'AZN') => (v == null ? '' : `${new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 2 }).format(v)} ${c}`);
/** Who added a record, in plain words (provenance, not a confirmation). */
export function addedBy(role: string, me: boolean) {
  if (me) return 'Siz əlavə etmisiniz';
  return ({ owner: 'Ev sahibi əlavə edib', member: 'Evi idarə edən şəxs əlavə edib', contributor: 'Redaktə icazəsi olan şəxs əlavə edib', technician: 'Redaktə icazəsi olan şəxs əlavə edib', performer: 'Usta əlavə edib' } as Record<string, string>)[role] ?? 'Əlavə edilib';
}
