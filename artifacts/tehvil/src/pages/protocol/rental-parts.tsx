import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Info, Minus, Plus, Trash2 } from 'lucide-react';
import { useAddProtocolItem, useDeleteProtocolItem, useDeleteProtocolMedia, useUpdateProtocolItem } from '@workspace/api-client-react';
import {
  CATEGORY_LABEL, CHANGE_LABEL, CONDITION_LABEL, METER_LABEL, errorText, timeAz,
  type Baseline, type Change, type Condition, type Detail, type Item, type Media, type SnapItem,
} from '@/lib/protocol/model';
import { PhotoCapture, PhotoGrid } from './photo-capture';

const silent = { mutation: { meta: { silent: true } } } as const;
const CHANGES: Change[] = ['unchanged', 'new_damage', 'changed', 'resolved', 'missing'];

/** Move-in item that a move-out item continues, with its photos. */
export function baselineOf(d: Detail) {
  const b = d.baseline;
  const items = new Map<string, SnapItem>();
  const rooms = new Map<string, Baseline['rooms'][number]>();
  for (const r of b?.rooms ?? []) { rooms.set(r.id, r); for (const i of r.items ?? []) items.set(i.id, i); }
  const media = new Map((b?.media ?? []).map((m) => [m.id, m]));
  const photos = (ids: string[]) => ids.map((id) => media.get(id)).filter((m): m is Media => !!m);
  return { items, rooms, photos, b };
}

function Cond({ value, onChange, disabled, testId }: { value: Condition | null; onChange: (c: Condition) => void; disabled: boolean; testId?: string }) {
  return <div className="pt-cond pt-cond-sm" role="radiogroup" aria-label="Vəziyyət">{(['good', 'fair', 'defective'] as Condition[]).map((c) => <button key={c} type="button" role="radio" aria-checked={value === c} disabled={disabled} className={`${c} ${value === c ? 'on' : ''}`} onClick={() => onChange(c)} data-testid={testId ? `${testId}-${c}` : undefined}>{CONDITION_LABEL[c]}</button>)}</div>;
}

function ItemCard({ d, it, put }: { d: Detail; it: Item; put: (x: unknown) => void }) {
  const pid = d.protocol.id, can = d.me.canEdit, out = d.protocol.kind === 'move_out';
  const upd = useUpdateProtocolItem(silent); const del = useDeleteProtocolItem(silent); const delMedia = useDeleteProtocolMedia(silent);
  const [note, setNote] = useState(it.note); const [err, setErr] = useState('');
  const save = (data: Parameters<typeof upd.mutate>[0]['data']) => upd.mutate({ protocolId: pid, itemId: it.id, data }, { onSuccess: put, onError: (e) => setErr(errorText(e)) });
  const base = baselineOf(d); const before = it.prevItemId ? base.items.get(it.prevItemId) : null;
  const photos = d.media.filter((m) => m.target === 'item' && m.itemId === it.id);
  return <li className={`pt-item ${it.condition ? 'set' : ''}`} data-testid="item">
    <div className="pt-item-head"><b>{it.name}</b><span className="pt-item-cat">{CATEGORY_LABEL[it.category] ?? it.category}</span>
      <span className="pt-qty">{can && it.category !== 'wall' && it.category !== 'floor' && it.category !== 'ceiling' ? <><button type="button" aria-label="Azalt" disabled={it.quantity <= 0} onClick={() => save({ quantity: it.quantity - 1 })}><Minus size={13} /></button><b data-testid="item-qty">{it.quantity}</b><button type="button" aria-label="Artır" onClick={() => save({ quantity: it.quantity + 1 })} data-testid="item-qty-plus"><Plus size={13} /></button></> : it.quantity !== 1 ? <b>{it.quantity} ədəd</b> : null}</span>
      {can && !it.prevItemId && <button type="button" className="icon-button" aria-label="Elementi sil" onClick={() => del.mutate({ protocolId: pid, itemId: it.id }, { onSuccess: put, onError: (e) => setErr(errorText(e)) })}><Trash2 size={13} /></button>}
    </div>
    {out && <div className="pt-before" data-testid="item-before">
      <small>Girişdə</small>
      {before ? <><span className={`pt-chip ${before.condition ?? ''}`}>{before.condition ? CONDITION_LABEL[before.condition] : 'qeyd edilməyib'}</span>{before.quantity !== 1 && <span> · {before.quantity} ədəd</span>}{before.note && <p>{before.note}</p>}<PhotoGrid media={base.photos(before.photos)} times /></>
        : <span>Girişdə qeyd olunmayıb</span>}
    </div>}
    {out && <small className="pt-now">İndi</small>}
    <Cond value={it.condition} onChange={(c) => save({ condition: c })} disabled={!can} testId="item-cond" />
    <textarea className="hp-input" rows={1} value={note} disabled={!can} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== it.note) save({ note }); }} placeholder={it.condition === 'defective' ? 'Nə zədələnib, harada?' : 'Qeyd (məcburi deyil)'} aria-label="Qeyd" data-testid="item-note" />
    {out && <div className="pt-changes-pick" role="radiogroup" aria-label="Dəyişiklik">{CHANGES.map((c) => <button key={c} type="button" role="radio" aria-checked={it.change === c} disabled={!can} className={it.change === c ? `on ${c}` : ''} onClick={() => save({ change: c })} data-testid={`item-change-${c}`}>{CHANGE_LABEL[c]}</button>)}</div>}
    <PhotoGrid media={photos} times onDelete={can ? (m) => delMedia.mutate({ protocolId: pid, mediaId: m.id }, { onSuccess: put }) : undefined} />
    {can && <PhotoCapture compact protocolId={pid} target={{ target: 'item', itemId: it.id }} onSaved={put} testId="item-capture" />}
    {err && <p className="ai-error pt-err">{err}</p>}
  </li>;
}

/** A room of a rental protocol: what is in it, each with condition, note and photos; on move-out also what changed. */
export function RentalRoomView({ d, roomId, put, back, next }: { d: Detail; roomId: string; put: (x: unknown) => void; back: () => void; next: (id: string) => void }) {
  const r = d.rooms.find((x) => x.id === roomId)!;
  const pid = d.protocol.id, can = d.me.canEdit;
  const add = useAddProtocolItem(silent); const delMedia = useDeleteProtocolMedia(silent);
  const [name, setName] = useState(''); const [cat, setCat] = useState('furniture'); const [err, setErr] = useState('');
  const items = d.items.filter((i) => i.roomId === roomId);
  const i = d.rooms.findIndex((x) => x.id === roomId); const after = d.rooms[i + 1];
  const base = baselineOf(d); const prevRoom = r.prevRoomId ? base.rooms.get(r.prevRoomId) : null;
  const gone = prevRoom ? (prevRoom.items ?? []).filter((pi) => !items.some((x) => x.prevItemId === pi.id)) : [];
  return <section className="pt-section" data-testid="room-view">
    <button type="button" className="pt-back" onClick={back}><ArrowLeft size={15} />Otaqlar</button>
    <h2 className="pt-room-title">{r.name}</h2>
    <p className="rl-hint">Hər element üçün vəziyyəti seçin; zədə, ləkə və ya nasazlıq varsa qısa yazın və foto çəkin.{d.protocol.kind === 'move_out' ? ' Girişdəki qeyd və fotolar müqayisə üçün yanında göstərilir. Sistem kimin günahkar olduğunu müəyyən etmir.' : ''}</p>
    <ul className="pt-items">{items.map((it) => <ItemCard key={it.id} d={d} it={it} put={put} />)}</ul>
    {gone.length > 0 && <p className="ai-warn"><Info size={14} />Girişdə var idi, burada yoxdur: {gone.map((g) => g.name).join(', ')}</p>}
    {can && <form className="pt-add-room" onSubmit={(e) => { e.preventDefault(); setErr(''); add.mutate({ protocolId: pid, data: { roomId, name, category: cat as never, quantity: 1 } }, { onSuccess: (x) => { put(x); setName(''); }, onError: (e2) => setErr(errorText(e2)) }); }}>
      <input className="hp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Əşya əlavə et: divan, soyuducu, kondisioner…" aria-label="Əşyanın adı" data-testid="item-add-name" />
      <select className="hp-input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Növ"><option value="furniture">Mebel</option><option value="appliance">Avadanlıq</option><option value="other">Digər</option></select>
      <button type="submit" className="button button-secondary" disabled={!name.trim() || add.isPending} data-testid="item-add"><Plus size={15} />Əlavə et</button>
    </form>}
    {err && <p className="ai-error pt-err">{err}</p>}
    <h3>Otağın ümumi fotoları</h3>
    {prevRoom && prevRoom.photos.length > 0 && <><small className="pt-now">Girişdə</small><PhotoGrid media={base.photos(prevRoom.photos)} times /></>}
    <PhotoGrid media={d.media.filter((m) => m.target === 'room' && m.roomId === roomId)} times onDelete={can ? (m) => delMedia.mutate({ protocolId: pid, mediaId: m.id }, { onSuccess: put }) : undefined} testId="room-photos" />
    {can && <PhotoCapture protocolId={pid} target={{ target: 'room', roomId }} onSaved={put} testId="room-capture" />}
    <p className="pt-time-note">⬆ yüklənmə vaxtını server qeyd edir. 📷 çəkilmə vaxtı fotonun öz məlumatıdır (cihazın məlumatı) — hər telefonda olmaya bilər.</p>
    <div className="pt-bar">{after ? <button type="button" className="button button-primary pt-big pt-wide" onClick={() => next(after.id)} data-testid="room-next">Növbəti: {after.name}<ArrowRight size={16} /></button>
      : <button type="button" className="button button-primary pt-big pt-wide" onClick={back} data-testid="room-done"><Check size={16} />Otaqlar hazırdır</button>}</div>
  </section>;
}

/** What is approved for a rental protocol; on move-out, move-in next to move-out. */
export function RentalReview({ d }: { d: Detail }) {
  const out = d.protocol.kind === 'move_out';
  const base = baselineOf(d);
  const x = d.protocol.extras;
  return <div className="pt-review" data-testid="review">
    {d.rooms.map((r) => <div key={r.id} className="pt-rv-room">
      <div className="pt-rv-head"><b>{r.name}</b></div>
      <ul className="pt-rv-items">{d.items.filter((i) => i.roomId === r.id).map((it) => { const before = it.prevItemId ? base.items.get(it.prevItemId) : null; return <li key={it.id}>
        <div className="pt-rv-line"><span>{it.name}{it.quantity !== 1 ? ` (${it.quantity})` : ''}</span>{out && <span className="pt-chip">{before ? `Girişdə: ${before.condition ? CONDITION_LABEL[before.condition] : '—'}` : 'Girişdə yox idi'}</span>}<span className={`pt-chip ${it.condition ?? ''}`}>{it.condition ? CONDITION_LABEL[it.condition] : 'qeyd edilməyib'}</span>{out && it.change && <span className={`pt-chip ch-${it.change}`}>{CHANGE_LABEL[it.change]}</span>}</div>
        {it.note && <p>{it.note}</p>}
        {out && before && base.photos(before.photos).length > 0 && <div className="pt-rv-pair"><small>Girişdə</small><PhotoGrid media={base.photos(before.photos)} /></div>}
        <PhotoGrid media={d.media.filter((m) => m.target === 'item' && m.itemId === it.id)} />
      </li>; })}</ul>
      <PhotoGrid media={d.media.filter((m) => m.target === 'room' && m.roomId === r.id)} />
    </div>)}
    <div className="pt-rv-room"><div className="pt-rv-head"><b>Sayğaclar</b></div><ul>{(['water', 'gas', 'electric'] as const).map((k) => { const bm = base.b?.meters.find((m) => m.kind === k); return <li key={k}>{METER_LABEL[k]}: {out && <>girişdə <b>{bm?.value || '—'}</b>, çıxışda </>}<b data-testid={`rv-meter-${k}`}>{x.meters[k].value || '—'}</b></li>; })}</ul></div>
    <div className="pt-rv-room"><div className="pt-rv-head"><b>Açarlar</b></div><ul>{x.keys.filter((k) => k.kind.trim()).map((k, i) => { const bk = base.b?.keys.find((y) => y.kind.trim() === k.kind.trim()); return <li key={i}>{k.kind}: {out ? <>verilib <b>{bk?.count ?? 0}</b>, qaytarılır <b>{k.count}</b></> : <b>{k.count}</b>}</li>; })}</ul></div>
    {x.notes && <div className="pt-rv-room"><div className="pt-rv-head"><b>Digər qeydlər</b></div><p>{x.notes}</p></div>}
  </div>;
}

export const photoTimeLine = (m: Media) => `Yüklənib: ${timeAz(m.createdAt)}${m.takenAt ? ` · çəkilib: ${timeAz(m.takenAt)} (cihaz)` : ''}`;
