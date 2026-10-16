import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarClock, Handshake, LoaderCircle, Pencil, Phone, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { getListRealtorAgentsQueryKey, useCreateRealtorAgent, useDeleteRealtorAgent, useListRealtorAgents, useUpdateRealtorAgent, type RealtorAgent } from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { Empty, Modal, Pill, RealtorToaster, Skeleton, toast } from '@/components/realtor/ui';

export function RealtorTeamPage() {
  const agents = useListRealtorAgents();
  const [editing, setEditing] = useState<RealtorAgent | 'new' | null>(null);
  const list = agents.data ?? [];
  const best = [...list].sort((a, b) => b.stats.deals - a.stats.deals || b.stats.appointments - a.stats.appointments)[0];
  return <>
    <PageHeading eyebrow="Komanda" title="Agentlər" description="Agentlərinizi əlavə edin, leadləri və elanları bölüşdürün, hər agentin nəticəsini görün." action={<button type="button" className="button button-primary" onClick={() => setEditing('new')} data-testid="button-add-agent"><UserPlus size={16} />Agent əlavə et</button>} />
    {agents.isLoading ? <Skeleton rows={2} /> : !list.length ? <Empty icon={<Users size={28} />} title="Komandada hələ agent yoxdur" text="Agent əlavə etdikdən sonra lead, elan və görüşləri ona təyin edə bilərsiniz. Hər agentin nəticələri burada görünəcək." action={<button type="button" className="button button-primary" onClick={() => setEditing('new')}><Plus size={16} />İlk agenti əlavə et</button>} />
      : <div className="surface rl-table-wrap"><table className="rl-table rl-team">
        <thead><tr><th>Agent</th><th>Aktiv lead</th><th>Cəmi lead</th><th>Görüş</th><th>Saziş</th><th>Elan</th><th>Konversiya</th><th /></tr></thead>
        <tbody>{list.map(a => <tr key={a.id} className={a.active ? '' : 'inactive'}>
          <td><strong>{a.fullName}{best?.id === a.id && a.stats.deals > 0 && <Pill small tone="ok">Lider</Pill>}{!a.active && <Pill small tone="neutral">Deaktiv</Pill>}</strong><small>{[a.phone, a.email].filter(Boolean).join(' · ') || '—'}</small></td>
          <td data-label="Aktiv lead">{a.stats.activeLeads}</td>
          <td data-label="Cəmi lead">{a.stats.leads}</td>
          <td data-label="Görüş"><CalendarClock size={12} className="sm-ii" /> {a.stats.appointments}</td>
          <td data-label="Saziş"><Handshake size={12} className="sm-ii" /> {a.stats.deals}</td>
          <td data-label="Elan"><Building2 size={12} className="sm-ii" /> {a.stats.listings}</td>
          <td data-label="Konversiya">{a.stats.leads ? `${Math.round((a.stats.deals / a.stats.leads) * 100)}%` : '—'}</td>
          <td><button type="button" className="icon-button" aria-label="Redaktə" onClick={() => setEditing(a)}><Pencil size={15} /></button></td>
        </tr>)}</tbody>
      </table></div>}
    <p className="rl-hint" style={{ marginTop: 14 }}>Leadləri agentə “Leadlər” bölməsində, elanları isə elan formasında təyin edin.</p>
    {editing && <AgentModal agent={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    <RealtorToaster />
  </>;
}

function AgentModal({ agent, onClose }: { agent: RealtorAgent | null; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useCreateRealtorAgent();
  const update = useUpdateRealtorAgent();
  const remove = useDeleteRealtorAgent();
  const [f, setF] = useState({ fullName: agent?.fullName ?? '', phone: agent?.phone ?? '', email: agent?.email ?? '', active: agent?.active ?? true });
  const done = (msg: string) => { void qc.invalidateQueries({ queryKey: getListRealtorAgentsQueryKey() }); toast(msg); onClose(); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (agent) update.mutate({ agentId: agent.id, data: f }, { onSuccess: () => done('Agent yadda saxlanıldı') });
    else create.mutate({ data: f }, { onSuccess: () => done('Agent əlavə olundu') });
  };
  return <Modal open onClose={onClose} eyebrow="Komanda" title={agent ? agent.fullName : 'Agent əlavə et'} footer={<div className="rl-drawer-actions">
    {agent && <button type="button" className="button button-quiet sm-btn-sm" onClick={() => { if (window.confirm('Agent silinsin? Onun leadləri və elanları sizə qalacaq.')) remove.mutate({ agentId: agent.id }, { onSuccess: () => done('Agent silindi') }); }}><Trash2 size={13} />Sil</button>}
    <button type="submit" form="agent-form" className="button button-primary" disabled={create.isPending || update.isPending}>{(create.isPending || update.isPending) && <LoaderCircle className="spin" size={15} />}Yadda saxla</button>
  </div>}>
    <form id="agent-form" className="rl-form" onSubmit={submit}>
      <Field label="Ad, soyad" name="agent-name" required value={f.fullName} onChange={v => setF(o => ({ ...o, fullName: v }))} />
      <div className="field-grid">
        <Field label="Telefon" name="agent-phone" type="tel" value={f.phone} onChange={v => setF(o => ({ ...o, phone: v }))} />
        <Field label="E-poçt" name="agent-email" type="email" value={f.email} onChange={v => setF(o => ({ ...o, email: v }))} />
      </div>
      <label className="rl-check"><input type="checkbox" checked={f.active} onChange={e => setF(o => ({ ...o, active: e.target.checked }))} /><span>Aktiv — yeni lead və elan təyin etmək olar</span></label>
      {agent && <p className="rl-hint"><Phone size={12} className="sm-ii" /> {agent.stats.activeLeads} aktiv lead, {agent.stats.appointments} görüş, {agent.stats.deals} saziş.</p>}
    </form>
  </Modal>;
}
