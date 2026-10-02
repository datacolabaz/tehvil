import type { T } from '@/components/kit';
import { actionLabel, roleLabel } from '@/components/kit';

// Only translate system-generated framing; keep participants' original text.
export function auditDetail(event: { action: string; detail?: string }, t: T) {
  const detail = event.detail || '';
  const label = actionLabel(event.action, t);
  if (['project.archived', 'passport.shared', 'passport.share_revoked'].includes(event.action)) return label;
  if (event.action === 'scope.version_created') {
    const version = detail.match(/\bv(\d+)/)?.[1];
    return `${t('scopeVersion')}${version ? ` v${version}` : ''} · ${t('previousPreserved')}`;
  }
  if (event.action === 'scope.submitted') {
    const version = detail.match(/\d+/)?.[0];
    return `${label}${version ? ` · ${t('scopeVersion')} v${version}` : ''}`;
  }
  if (['scope.approved', 'scope.approval_recorded'].includes(event.action)) {
    const match = detail.match(/^İş həcmi v(\d+): (.*)$/s);
    if (match) return `${t('scopeVersion')} v${match[1]}: ${match[2] === 'təsdiq qeydə alındı' ? t('act_scope_approval_recorded') : match[2]}`;
  }
  if (event.action === 'participant.invited') {
    const match = detail.match(/^(.*) üçün (contractor|viewer) dəvəti yaradıldı$/s);
    if (match) return `${label}: ${match[1]} · ${roleLabel(match[2], t)}`;
  }
  if (event.action === 'participant.joined') return `${label}: ${detail.replace(/ layihəyə qoşuldu$/, '')}`;
  if (event.action.startsWith('change_order.')) {
    const match = detail.match(/^Dəyişiklik sifarişi #(\d+): (.*)$/s);
    if (match) {
      const status: Record<string, string> = { approved: t('approved'), rejected: t('rejected'), needs_clarification: t('pendingApproval') };
      return `${t('changes')} #${match[1]}: ${status[match[2]] || match[2]}`;
    }
  }
  const prefixes: Record<string, string> = {
    'project.created': 'Layihə yaradıldı: ', 'scope.room_added': 'Ərazi əlavə edildi: ',
    'milestone.created': 'Mərhələ əlavə edildi: ', 'milestone.handover_submitted': 'Təhvil təqdim edildi: ',
    'milestone.accepted': 'Mərhələ qəbul edildi: ', 'milestone.revision_requested': 'Düzəliş istənildi: ',
    'revision.created': 'Düzəliş tələbi: ', 'revision.replied': 'Cavab verildi: ', 'revision.resolved': 'Düzəliş həll edildi: ',
    'payment.planned': 'Ödəniş mərhələsi əlavə edildi: ', 'payment.marked_sent': 'Ödəniş göndərildi kimi qeyd edildi: ',
    'payment.confirmed_received': 'Ödənişin qəbulu təsdiqləndi: ',
  };
  const prefix = prefixes[event.action];
  if (prefix && detail.includes(': ')) return `${label}: ${detail.slice(detail.indexOf(': ') + 2)}`;
  if (event.action === 'scope.item_added') {
    for (const [prefix, key] of [['Daxildir: ', 'included'], ['Daxil deyil: ', 'excluded']] as const) {
      if (detail.startsWith(prefix)) return `${t(key)}: ${detail.slice(prefix.length)}`;
    }
  }
  return detail;
}