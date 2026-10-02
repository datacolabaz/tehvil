import { ArrowRight, Check, CheckCircle2, DoorOpen, Pencil, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { Room, ScopeItem } from '@workspace/api-client-react';
import { Button, EmptyLine, PageHeading, QuerySection, Status, materialLabel, money, type T } from '@/components/kit';

function ScopeRow({ item, t, onEdit }: { item: ScopeItem; t: T; onEdit?: () => void }) {
  return <div className="scope-row"><div className={`scope-inclusion ${item.inclusionType}`}><span>{item.inclusionType === 'included' ? <Check size={13} /> : <X size={13} />}</span><small>{t(item.inclusionType)}</small></div><div className="scope-description"><strong>{item.title}</strong><p>{item.description || '—'}</p></div><div className="scope-responsibility"><small>{t('materialResponsibility')}</small><span>{materialLabel(item.materialResponsibility, t)}</span></div><div className="scope-cost"><small>{t('labor')}</small><b>{money(item.laborAmount)} AZN</b></div><div className="inline-actions"><Status value={item.status} t={t} />{onEdit && <button className="icon-button" onClick={onEdit} aria-label={t('editItem')} title={t('editItem')} data-testid={`button-edit-${item.id}`}><Pencil size={15} /></button>}</div></div>;
}

export function ScopePage(p: any) {
  const { project, t, rooms, scope, roomForm, scopeCreate, setShowRoom, openScope, editItem, submitScope, approveScope, createVersion, id, refreshCore, notify, canWrite, canEditScope } = p as Record<string, any> & { t: T };
  const items: ScopeItem[] = scope.data || [];
  const status: string = project.scopeStatus;
  const pending = status === 'pending' || status === 'pending_approval' || status === 'submitted';
  const approved = status === 'approved';
  const draft = !pending && !approved;
  const version = (project as any).scopeVersion;
  const unassigned = items.filter(s => !s.roomId);
  const roomList: Room[] = rooms.data || [];
  const note = approved ? t('scopeApprovedNote') : pending ? t('scopePendingNote') : t('scopeDraftNote');
  return <><PageHeading eyebrow={t('eyScope')} title={t('scope')} description={t('stages')[0]} action={canEditScope ? <div className="heading-buttons"><Button variant="secondary" onClick={() => setShowRoom(true)}><Plus size={15} />{t('addRoom')}</Button><Button onClick={() => openScope('')}><Plus size={15} />{t('addScope')}</Button></div> : undefined} />
    <div className={`scope-state ${pending ? 'pending' : approved ? 'approved' : ''}`} data-testid="scope-state"><Status value={approved ? 'approved' : pending ? 'submitted' : 'draft'} t={t} /><span>{version != null && <b>{t('scopeVersion')} v{version} · </b>}{note}</span></div>
    {!canWrite && <div className="notice manual-notice">{t('readOnly')}</div>}
    {roomForm}{scopeCreate}
    <div className="scope-summary"><span><DoorOpen size={17} />{roomList.length} {t('rooms').toLowerCase()}</span><span><CheckCircle2 size={17} />{items.filter(s => s.inclusionType === 'included').length} {t('included').toLowerCase()}</span><span><X size={16} />{items.filter(s => s.inclusionType === 'excluded').length} {t('excluded').toLowerCase()}</span>
      {canWrite && <div className="scope-actions">
        {draft && <Button variant="secondary" disabled={submitScope.isPending} onClick={() => submitScope.mutate({ projectId: id }, { onSuccess: () => { refreshCore(); notify(t('sent')); } })}><ArrowRight size={15} />{t('submitScope')}</Button>}
        {pending && <Button disabled={approveScope.isPending} onClick={() => approveScope.mutate({ projectId: id, data: { comment: null } }, { onSuccess: () => { refreshCore(); notify(t('approved')); } })}><Check size={15} />{t('approve')}</Button>}
        {(pending || approved) && <Button variant="secondary" disabled={createVersion.isPending} onClick={() => createVersion.mutate({ projectId: id }, { onSuccess: () => { refreshCore(); notify(t('created')); } })} testId="button-new-version"><RefreshCw size={15} />{t('newVersion')}</Button>}
      </div>}</div>
    <QuerySection q={{ isLoading: rooms.isLoading || scope.isLoading, isError: rooms.isError || scope.isError, refetch: () => Promise.all([rooms.refetch(), scope.refetch()]) as any }} t={t}>
      <div className="scope-room-list">
        {roomList.map((room, i) => { const list = items.filter(s => s.roomId === room.id); return <section className="room-section surface" key={room.id}><div className="room-section-head"><div className={`room-index index-${i % 4}`}>{String(i + 1).padStart(2, '0')}</div><div><div className="eyebrow">{t('room')} {String(i + 1).padStart(2, '0')}</div><h2>{room.name}</h2></div><span className="room-item-count">{list.length} {t('items')}</span>{canEditScope && <button className="icon-button" onClick={() => openScope(room.id)} aria-label={t('addScope')}><Plus size={17} /></button>}</div><div className="scope-items">{list.map(item => <ScopeRow key={item.id} item={item} t={t} onEdit={canEditScope ? () => editItem(item) : undefined} />)}</div>{!list.length && <EmptyLine t={t} />}</section>; })}
        {unassigned.length > 0 && <section className="room-section surface" data-testid="section-unassigned"><div className="room-section-head"><div className="room-index index-3">—</div><div><div className="eyebrow">{t('scope')}</div><h2>{t('unassigned')}</h2></div><span className="room-item-count">{unassigned.length} {t('items')}</span></div><div className="scope-items">{unassigned.map(item => <ScopeRow key={item.id} item={item} t={t} onEdit={canEditScope ? () => editItem(item) : undefined} />)}</div></section>}
        {!roomList.length && !unassigned.length && <div className="empty-projects compact-empty"><div className="empty-illustration"><DoorOpen size={34} /></div><h2 className="font-display">{t('empty')}</h2>{canEditScope && <Button onClick={() => setShowRoom(true)}><Plus size={16} />{t('addRoom')}</Button>}</div>}
      </div></QuerySection>
    <div className="audit-banner"><ShieldCheck size={18} /><span>{t('approveAudit')}</span></div></>;
}
