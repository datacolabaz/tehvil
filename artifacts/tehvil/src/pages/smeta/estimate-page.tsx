import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft, CalendarDays, Check, Copy, ExternalLink, FileSpreadsheet, FileText, MapPin, MessageSquareText, MoreHorizontal, Ruler, Send, Sparkles, UserRound } from 'lucide-react';
import { Button } from '@/components/kit';
import { AssistantDrawer } from '@/components/smeta/assistant-drawer';
import { ChangesTab } from '@/components/smeta/changes-tab';
import { DocumentsTab } from '@/components/smeta/documents-tab';
import { EstimateTable } from '@/components/smeta/estimate-table';
import { ExpensesTab } from '@/components/smeta/expenses-tab';
import { PhotosTab } from '@/components/smeta/photos-tab';
import { SendModal, copyText, publicEstimateUrl } from '@/components/smeta/send-modal';
import { SummaryTab } from '@/components/smeta/summary-tab';
import { TakeoffTab } from '@/components/smeta/takeoff-tab';
import { runExport } from '@/components/smeta/export-actions';
import { DropItem, DropMenu, DropSep, SmetaToaster, StatusBadge } from '@/components/smeta/ui';
import { projectTotals } from '@/lib/smeta/calc';
import { PROPERTY_LABEL, RENOVATION_LABEL } from '@/lib/smeta/catalog';
import { azn, dateAz, num, qty } from '@/lib/smeta/format';
import { displayStatus, hasUnsentChanges, useFirstLoad, useSmetaProject } from '@/lib/smeta/store';

const TABS = [
  { id: 'summary', label: 'Xülasə' },
  { id: 'estimate', label: 'Smeta' },
  { id: 'drawing', label: 'Çertyoj və ölçülər' },
  { id: 'changes', label: 'Dəyişikliklər' },
  { id: 'expenses', label: 'Xərclər' },
  { id: 'photos', label: 'Foto sübutlar' },
  { id: 'documents', label: 'Sənədlər' },
] as const;
type TabId = typeof TABS[number]['id'];

const initialTab = (): TabId => {
  const t = new URLSearchParams(window.location.search).get('tab');
  return TABS.some(x => x.id === t) ? t as TabId : 'summary';
};

export function EstimateDetailPage({ projectId }: { projectId: string }) {
  const p = useSmetaProject(projectId);
  const loading = useFirstLoad(`smeta-detail-${projectId}`, 320);
  const [tab, setTabState] = useState<TabId>(initialTab);
  const [sendOpen, setSendOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setTab = (id: TabId) => {
    setTabState(id);
    const url = new URL(window.location.href);
    if (id === 'summary') url.searchParams.delete('tab'); else url.searchParams.set('tab', id);
    window.history.replaceState(window.history.state, '', url);
  };
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const n = (next + TABS.length) % TABS.length;
    setTab(TABS[n].id);
    tabRefs.current[n]?.focus();
  };

  if (!p) return <div className="sm-empty surface"><div className="empty-illustration"><FileSpreadsheet size={28} /></div><h3>Smeta tapılmadı</h3><p>Layihə silinib və ya link səhvdir.</p><Link href="/smeta" className="button button-primary"><ArrowLeft size={16} />AI Smeta siyahısına qayıt</Link></div>;
  if (loading) return <div aria-busy="true" aria-label="Smeta yüklənir"><div className="sm-skel-card" style={{ height: 120, marginBottom: 16 }} /><div className="sm-skel-grid">{[0, 1, 2, 3].map(i => <div className="sm-skel-card" key={i} />)}</div><div className="sm-skel-card tall" /></div>;

  const t = projectTotals(p);
  const unsent = hasUnsentChanges(p);
  const lastApproval = p.approvals[p.approvals.length - 1];
  const lastRevision = p.revisionRequests[p.revisionRequests.length - 1];
  const aiLines = p.estimate.sections.flatMap(s => s.items).filter(i => i.status === 'ai' || i.status === 'draft').length;
  const pendingMeasures = p.measurements.filter(m => m.status === 'suggested').length;
  const pendingChanges = p.changeOrders.filter(c => c.status === 'pending').length;
  const counts: Partial<Record<TabId, { n: number; warn?: boolean; label: string }>> = {
    estimate: aiLines ? { n: aiLines, warn: true, label: `${aiLines} sətir yoxlanmalıdır` } : undefined,
    drawing: pendingMeasures ? { n: pendingMeasures, warn: true, label: `${pendingMeasures} ölçü yoxlanmalıdır` } : undefined,
    changes: p.changeOrders.length ? { n: p.changeOrders.length, warn: pendingChanges > 0, label: `${p.changeOrders.length} dəyişiklik${pendingChanges ? `, ${pendingChanges} təsdiq gözləyir` : ''}` } : undefined,
    expenses: p.expenses.length ? { n: p.expenses.length, label: `${p.expenses.length} xərc` } : undefined,
    photos: p.photos.length ? { n: p.photos.length, label: `${p.photos.length} foto` } : undefined,
  };

  return <>
    <header className="sm-detail-head">
      <div className="sm-detail-title">
        <div className="eyebrow">{PROPERTY_LABEL[p.propertyKind]} · {RENOVATION_LABEL[p.renovationKind]} təmir · Smeta v{p.estimate.version}</div>
        <h1>{p.name}</h1>
        <div className="sm-detail-meta">
          <StatusBadge status={displayStatus(p)} />
          <span><CalendarDays size={13} aria-hidden />Son yenilənmə: {dateAz(p.updatedAt)}</span>
          <span><MapPin size={13} aria-hidden />{p.district} · {qty(p.areaM2)} m²</span>
          <span><UserRound size={13} aria-hidden />{p.client.name}</span>
        </div>
      </div>
      <div className="sm-total-block" aria-live="polite">
        <span className="eyebrow">Ümumi smeta</span>
        <strong className="num" data-testid="text-header-total">{azn(t.total)}</strong>
        <small>Materiallar {azn(t.material)} · İşçilik {azn(t.labor)}</small>
        {lastApproval && <small><Check size={11} aria-hidden className="sm-ii" /> Sifarişçi v{lastApproval.estimateVersion} versiyasını {dateAz(lastApproval.approvedAt)} təsdiqləyib</small>}
      </div>
    </header>

    <div className="sm-actions">
      <Button onClick={() => setSendOpen(true)} testId="button-send-client"><Send size={16} />Sifarişçiyə göndər</Button>
      <Button variant="secondary" onClick={() => runExport(p, 'xlsx')} testId="button-export-excel"><FileSpreadsheet size={16} />Excel ixrac et</Button>
      <Button variant="secondary" onClick={() => runExport(p, 'pdf')} testId="button-export-pdf"><FileText size={16} />PDF ixrac et</Button>
      <span className="sm-spacer" />
      <Button variant="quiet" onClick={() => setAssistantOpen(true)} testId="button-assistant"><Sparkles size={16} />AI köməkçi</Button>
      <DropMenu trigger={<button type="button" className="icon-button" aria-label="Digər əməliyyatlar" data-testid="button-more"><MoreHorizontal size={18} /></button>}>
        {p.share && <DropItem icon={<ExternalLink size={14} />} onSelect={() => window.open(publicEstimateUrl(p.share!.token), '_blank', 'noopener')}>Sifarişçi görünüşünə bax</DropItem>}
        {p.share && <DropItem icon={<Copy size={14} />} onSelect={() => { void copyText(publicEstimateUrl(p.share!.token)); }}>Paylaşım linkini kopyala</DropItem>}
        {aiLines > 0 && <DropItem icon={<Check size={14} />} onSelect={() => { setTab('estimate'); }}>AI sətirlərini yoxla ({aiLines})</DropItem>}
        {pendingMeasures > 0 && <DropItem icon={<Ruler size={14} />} onSelect={() => setTab('drawing')}>Ölçüləri yoxla ({pendingMeasures})</DropItem>}
        <DropSep />
        <DropItem icon={<MessageSquareText size={14} />} onSelect={() => setTab('documents')}>Sifarişçi qərarları və sənədlər</DropItem>
      </DropMenu>
    </div>

    {p.status === 'revision_requested' && lastRevision && <div className="sm-unsent" role="status"><MessageSquareText size={16} aria-hidden /><span><b>{lastRevision.name} düzəliş istəyib (v{lastRevision.estimateVersion}):</b> “{lastRevision.message}”</span><button type="button" className="sm-link-btn" onClick={() => setTab('estimate')}>Smetanı düzəlt</button></div>}
    {unsent && p.share && <div className="sm-unsent" role="status"><AlertTriangle size={16} aria-hidden /><span>Sifarişçi v{p.share.snapshot.version} versiyasını görür. Son dəyişiklikləriniz hələ göndərilməyib.</span><button type="button" className="sm-link-btn" onClick={() => setSendOpen(true)}>Yeni versiyanı göndər</button></div>}

    <div className="sm-tabs" role="tablist" aria-label="Smeta bölmələri">
      {TABS.map((x, i) => {
        const c = counts[x.id];
        return <button key={x.id} ref={el => { tabRefs.current[i] = el; }} type="button" role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`panel-${x.id}`} tabIndex={tab === x.id ? 0 : -1} className="sm-tab" onClick={() => setTab(x.id)} onKeyDown={e => onTabKey(e, i)} data-testid={`tab-${x.id}`}>
          {x.label}{c && <span className={`count ${c.warn ? 'warn' : ''}`} aria-label={c.label}>{c.n}</span>}
        </button>;
      })}
    </div>

    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={-1}>
      {tab === 'summary' && <SummaryTab project={p} />}
      {tab === 'estimate' && <EstimateTable project={p} />}
      {tab === 'drawing' && <TakeoffTab project={p} />}
      {tab === 'changes' && <ChangesTab project={p} />}
      {tab === 'expenses' && <ExpensesTab project={p} />}
      {tab === 'photos' && <PhotosTab project={p} />}
      {tab === 'documents' && <DocumentsTab project={p} onSend={() => setSendOpen(true)} />}
    </div>

    <SendModal project={p} open={sendOpen} onClose={() => setSendOpen(false)} />
    <AssistantDrawer project={p} open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    <SmetaToaster />
  </>;
}
