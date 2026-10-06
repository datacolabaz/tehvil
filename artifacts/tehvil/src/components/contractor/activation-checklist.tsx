import { useState } from 'react';
import { Link } from 'wouter';
import { Award, Check, ListChecks, X } from 'lucide-react';
import { updateContractorChecklist, type ContractorAccount } from '@workspace/api-client-react';
import { setContractorAccount, useContractorAccount } from '@/lib/contractor/account';
import { useSmetaProjects } from '@/lib/smeta/store';

type ItemKey = keyof ContractorAccount['checklist']['items'];

const ITEMS: { key: ItemKey; label: string; action: string; href: (firstProjectId?: string) => string }[] = [
  { key: 'companyProfile', label: 'Şirkət profilini tamamlayın', action: 'Profilə keç', href: () => '/settings/company-profile' },
  { key: 'firstEstimate', label: 'İlk smetanı yaradın', action: 'Yeni smeta', href: () => '/smeta/new?guide=1' },
  { key: 'clientAdded', label: 'Sifarişçi əlavə edin', action: 'Sifarişçini yaz', href: id => (id ? `/smeta/${id}?tab=estimate&send=1` : '/smeta/new?guide=1') },
  { key: 'estimateShared', label: 'Smetanı paylaşın', action: 'Göndər', href: id => (id ? `/smeta/${id}?tab=estimate&guide=1` : '/smeta/new?guide=1') },
  { key: 'photoEvidence', label: 'İlk foto sübutu əlavə edin', action: 'Foto əlavə et', href: id => (id ? `/smeta/${id}?tab=photos` : '/smeta/new?guide=1') },
];

export const REWARD_TEXT = 'İlk təsdiqlənmiş smetanızdan sonra layihə nəzarəti daha aydın olacaq.';

/**
 * "İlk layihənizi hazırlayın" card for new accounts. State is computed on the
 * server from real data; only the dismissal is stored. Existing (legacy) accounts never see it.
 */
export function ActivationChecklist() {
  const { account } = useContractorAccount();
  const projects = useSmetaProjects();
  const [busy, setBusy] = useState(false);
  if (!account || account.plan.source === 'legacy') return null;

  const items = account.checklist.items;
  const done = ITEMS.filter(i => items[i.key]).length;
  const firstOwn = projects.find(p => !p.demo)?.id;
  const setDismissed = async (dismissed: boolean) => {
    setBusy(true);
    try { setContractorAccount(await updateContractorChecklist({ dismissed })); } finally { setBusy(false); }
  };

  if (account.checklist.dismissed) {
    if (done === ITEMS.length) return null;
    return <button type="button" className="ct-reopen" onClick={() => { void setDismissed(false); }} disabled={busy} data-testid="button-checklist-reopen"><ListChecks size={15} aria-hidden />İlk layihə planı · {done} / {ITEMS.length}</button>;
  }

  const pct = Math.round((done / ITEMS.length) * 100);
  return <section className="ct-activation" aria-labelledby="activation-title" data-testid="activation-checklist">
    <div className="ct-activation-head">
      <div><span className="eyebrow">Başlanğıc</span><h2 id="activation-title">İlk layihənizi hazırlayın</h2></div>
      <button type="button" className="icon-button" aria-label="Siyahını gizlət" onClick={() => { void setDismissed(true); }} disabled={busy} data-testid="button-checklist-dismiss"><X size={16} /></button>
    </div>
    <div className="ct-meter"><div className="ct-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={ITEMS.length} aria-valuenow={done} aria-label="Hazırlıq"><span style={{ width: `${pct}%` }} /></div><b data-testid="text-checklist-progress">{done} / {ITEMS.length} tamamlandı</b></div>
    <ul className="ct-checklist">{ITEMS.map(i => {
      const ok = items[i.key];
      return <li key={i.key} className={`ct-check-item ${ok ? 'done' : ''}`}>
        <span aria-hidden><Check size={14} /></span>
        <span className="ct-check-label">{i.label}<span className="sr-only">{ok ? ' — tamamlanıb' : ' — gözləyir'}</span></span>
        {!ok && <Link href={i.href(firstOwn)} className="sm-link-btn">{i.action}</Link>}
      </li>;
    })}</ul>
    <p className="ct-reward">
      <Award size={16} aria-hidden />
      {account.checklist.firstApproval ? 'Sifarişçi ilk smetanızı təsdiqləyib. Dəyişiklik və xərcləri artıq bu layihədə izləyə bilərsiniz.' : REWARD_TEXT}
    </p>
  </section>;
}
