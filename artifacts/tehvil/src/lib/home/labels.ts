import type { QueryClient } from '@tanstack/react-query';

/** Azerbaijani labels for the digital home passport (like the Smeta and Realtor modules). */

export const PROPERTY: Record<string, string> = { apartment: 'Mənzil', house: 'Fərdi ev', villa: 'Villa', office: 'Ofis', commercial: 'Kommersiya obyekti', other: 'Digər' };
export const STAGE: Record<string, string> = { construction: 'Tikinti', renovation: 'Təmir', living: 'Yaşayış' };
export const HOME_ROLE: Record<string, string> = { owner: 'Ev sahibi', technician: 'Texniki mütəxəssis', viewer: 'Ailə üzvü', performer: 'İcraçı' };

export const ROOM_KIND: Record<string, string> = { living: 'Qonaq otağı', bedroom: 'Yataq otağı', kitchen: 'Mətbəx', bathroom: 'Hamam', toilet: 'Tualet', hall: 'Dəhliz', balcony: 'Balkon', utility: 'Texniki otaq', other: 'Digər' };
export const ROOM_CONDITION: Record<string, string> = { good: 'Yaxşı vəziyyətdə', needs_repair: 'Təmir lazımdır', in_progress: 'Təmirdədir', unknown: 'Qeyd edilməyib' };

export const WORK_CATEGORY: Record<string, string> = {
  electrical: 'Elektrik', plumbing: 'Santexnika', sewer: 'Kanalizasiya', heating: 'İstilik / kombi', tiling: 'Kafel', plaster: 'Suvaq', painting: 'Rəngləmə',
  flooring: 'Döşəmə', drywall: 'Alçıpan', welding: 'Qaynaq', carpentry: 'Dülgərlik / mebel', roofing: 'Dam', hvac: 'Kondisioner / ventilyasiya', insulation: 'İzolyasiya',
  general: 'Ümumi işlər', other: 'Digər',
};
export const WORK_KIND: Record<string, string> = { construction: 'Tikinti', renovation: 'Təmir', installation: 'Quraşdırma', maintenance: 'Texniki xidmət', repair: 'Təmir / nasazlıq', inspection: 'Yoxlama' };
export const WORK_STATUS: Record<string, string> = { planned: 'Planlaşdırılıb', in_progress: 'İcra olunur', completed: 'Ev sahibinin təsdiqini gözləyir', confirmed: 'Ev sahibi təsdiqləyib', revision: 'Düzəliş istənib' };
export const WORK_TONE: Record<string, 'ok' | 'warn' | 'info' | 'neutral' | 'risk'> = { planned: 'neutral', in_progress: 'info', completed: 'warn', confirmed: 'ok', revision: 'risk' };

export const PART_ROLE: Record<string, string> = { lead: 'Əsas icraçı', team_lead: 'Briqada rəhbəri', team_member: 'Briqada üzvü', assistant: 'Köməkçi', supervisor: 'Nəzarətçi', inspector: 'Texniki yoxlayan' };
export const PART_ROLES = ['lead', 'team_lead', 'team_member', 'assistant', 'supervisor', 'inspector'] as const;
export const PART_STATUS: Record<string, string> = { invited: 'Dəvət göndərilib', accepted: 'İştirakı təsdiqləyib', declined: 'İmtina edib', removed: 'Çıxarılıb', recorded: 'Ev sahibinin qeydi (qeydiyyatsız)' };
export const PART_TONE: Record<string, 'ok' | 'warn' | 'info' | 'neutral' | 'risk'> = { invited: 'warn', accepted: 'ok', declined: 'neutral', removed: 'neutral', recorded: 'info' };

export const WORKER_KIND: Record<string, string> = { individual: 'Fərdi usta', team: 'Briqada', company: 'Şirkət' };
export const MEMBER_ROLE: Record<string, string> = { leader: 'Rəhbər', member: 'Üzv', representative: 'Nümayəndə' };
export const MEMBER_STATUS: Record<string, string> = { invited: 'Dəvət olunub', active: 'Aktiv', declined: 'İmtina edib', left: 'Ayrılıb', removed: 'Çıxarılıb' };

export const NOTE_KIND: Record<string, string> = { note: 'Qeyd', defect: 'Nasazlıq / qüsur', fix: 'Düzəliş edildi', inspection: 'Texniki yoxlama' };
export const PHASE: Record<string, string> = { before: 'Əvvəl', during: 'İş zamanı', after: 'Sonra', hidden: 'Gizli (divar bağlanmazdan əvvəl)', other: 'Digər' };

export const INFRA_TYPE: Record<string, string> = { electric: 'Elektrik xətti', water: 'Su xətti', sewer: 'Kanalizasiya', heating: 'İstilik xətti', gas: 'Qaz xətti', ventilation: 'Ventilyasiya', internet: 'İnternet / zəif cərəyan', other: 'Digər' };
export const INFRA_COLOR: Record<string, string> = { electric: '#e0a100', water: '#2477d6', sewer: '#7a5230', heating: '#d6452a', gas: '#e6c419', ventilation: '#3aa39a', internet: '#7b4fd6', other: '#5b6b66' };
export const INFRA_SOURCE: Record<string, string> = { owner: 'Ev sahibinin qeydi', worker: 'Ustanın qeydi', plan: 'Plan / layihə sənədi', specialist: 'Mütəxəssis qeydi' };

export const EQUIP_CATEGORY: Record<string, string> = { boiler: 'Kombi', air_conditioner: 'Kondisioner', water_filter: 'Su filtri', water_heater: 'Su qızdırıcısı', electrical_panel: 'Elektrik paneli', ventilation: 'Ventilyasiya', appliance: 'Məişət texnikası', other: 'Digər' };

export const SHARE_LEVEL: Record<string, string> = { selected: 'Seçilmiş otaq / iş / avadanlıq', technical: 'Texniki (usta və mütəxəssis üçün)' };
export const PUBLIC_LEVEL: Record<string, string> = { off: 'Bağlıdır', basic: 'Əsas məlumat', history: 'Əsas məlumat + təsdiqlənmiş işlər' };

export const AUDIT_ACTION: Record<string, string> = {
  'home.created': 'Ev yaradıldı', 'home.updated': 'Ev profili dəyişdi', 'home.archived': 'Ev arxivləndi',
  'room.created': 'Otaq əlavə olundu', 'room.updated': 'Otaq dəyişdi', 'room.deleted': 'Otaq silindi',
  'work.created': 'İş qeydi yaradıldı', 'work.updated': 'İş qeydi dəyişdi', 'work.updated_after_confirmation': 'Təsdiqdən sonra dəyişiklik',
  'work.start': 'İş başladı', 'work.complete': 'İş tamamlandı', 'work.confirm': 'Ev sahibi təsdiqlədi', 'work.request_revision': 'Düzəliş istəndi', 'work.reopen': 'İş yenidən açıldı',
  'participant.invited': 'İcraçı dəvət olundu', 'participant.recorded': 'Qeydiyyatsız icraçı qeyd olundu', 'participant.accepted': 'İcraçı iştirakı təsdiqlədi',
  'participant.declined': 'İcraçı imtina etdi', 'participant.removed': 'İcraçı çıxarıldı', 'participant.updated': 'İcraçının rolu dəyişdi', 'placeholder.claimed': 'Qeydiyyatsız profil həqiqi profilə bağlandı',
  'note.note': 'Qeyd', 'note.defect': 'Nasazlıq qeydi', 'note.fix': 'Düzəliş qeydi', 'note.inspection': 'Texniki yoxlama',
  'media.added': 'Foto / video əlavə olundu', 'media.hidden': 'Fayl gizlədildi',
  'infrastructure.created': 'Kommunikasiya xətti qeyd olundu', 'infrastructure.updated': 'Kommunikasiya xətti dəyişdi', 'infrastructure.deleted': 'Kommunikasiya xətti silindi', 'infrastructure.verified': 'Mütəxəssis xətti təsdiqlədi',
  'equipment.created': 'Avadanlıq əlavə olundu', 'equipment.updated': 'Avadanlıq dəyişdi', 'equipment.deleted': 'Avadanlıq silindi',
  'invitation.created': 'Dəvət linki yaradıldı', 'member.joined': 'Üzv qoşuldu', 'member.removed': 'Üzv çıxarıldı',
  'sharing.updated': 'QR səhifəsinin ayarları dəyişdi', 'share.created': 'Paylaşım linki yaradıldı', 'share.revoked': 'Paylaşım linki ləğv olundu',
  'review.created': 'Rəy yazıldı', 'review.reported': 'Rəy mübahisələndirildi',
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
