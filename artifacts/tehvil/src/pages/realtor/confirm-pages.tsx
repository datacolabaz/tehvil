import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, Check, CheckCircle2, HardHat, KeyRound, LoaderCircle, MapPin } from 'lucide-react';
import {
  useConfirmContractorWork, useDecideOwnerWork, useGetContractorConfirmation, useGetOwnerConfirmation,
  type OwnerConfirmView, type PublicPassportWork,
} from '@workspace/api-client-react';
import { CertifiedSeal, TrustLadder } from '@/components/realtor/ui';
import { facts, type Trust } from '@/lib/realtor/labels';
import { PublicFrame, PublicState, WorkBlock } from './public-passport-page';

const NAME_KEY = 'tehvil-confirm-name';
const rememberedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const rememberName = (v: string) => { try { localStorage.setItem(NAME_KEY, v); } catch { /* ignore */ } };

/* -------------------------------------------------------------- contractor */

export function ContractorConfirmPage({ token }: { token: string }) {
  const qc = useQueryClient();
  const key = ['contractor-confirm', token];
  const view = useGetContractorConfirmation(token, { query: { retry: false, refetchOnWindowFocus: false, queryKey: key } });
  const confirm = useConfirmContractorWork();
  const [name, setName] = useState(rememberedName);
  const [note, setNote] = useState('');
  const [agree, setAgree] = useState(false);
  if (view.isLoading) return <PublicState loading />;
  if (!view.data) return <PublicState title="Link aktiv deyil" text="Bu təsdiq linki köhnəlib və ya ləğv edilib. Realtordan yeni link istəyin." />;
  const v = view.data;
  const submit = (e: FormEvent) => {
    e.preventDefault(); if (!agree) return;
    rememberName(name.trim());
    confirm.mutate({ token, data: { name: name.trim(), note: note.trim(), confirm: true } }, { onSuccess: data => qc.setQueryData(key, data) });
  };
  return <PublicFrame>
    <section className="rl-confirm-head">
      <div className="eyebrow"><HardHat size={13} className="sm-ii" /> Podratçı təsdiqi</div>
      <h1 className="font-display">{v.confirmed ? 'Təşəkkürlər! İş təsdiqləndi.' : 'Bu işi siz görmüsünüz?'}</h1>
      <p>{v.realtorName}{v.agency ? ` (${v.agency})` : ''} sizdən <b>{v.passportTitle}</b> <span className="rl-muted-inline"><MapPin size={12} className="sm-ii" /> {v.district}</span> mənzilindəki aşağıdakı işi təsdiqləməyi xahiş edir. Təsdiqiniz alıcıya mənzilin təmir tarixçəsinin real olduğunu göstərir.</p>
    </section>
    <WorkBlock w={v.work} index={0} />
    {v.confirmed ? <div className="rl-confirm-done"><CheckCircle2 size={22} /><div><strong>{v.confirmedName} tərəfindən təsdiqlənib</strong><small>Pasportda “Podratçı təsdiqləyib” kimi göstərilir. Bu səhifəni bağlaya bilərsiniz.</small></div></div>
      : <form className="rl-confirm-form surface" onSubmit={submit}>
        <label className="field"><span>Adınız və ya şirkətiniz</span><input required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} data-testid="input-contractor-name" /></label>
        <label className="field"><span>Qeyd (istəyə görə)</span><textarea rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="məs. Zəmanət 12 ay" /></label>
        <label className="rl-check big"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span><b>Bu işi mən görmüşəm.</b> Təsvir, tarix və fotolar düzgündür.</span></label>
        <button type="submit" className="button button-primary full-button" disabled={!agree || confirm.isPending} data-testid="button-contractor-confirm">{confirm.isPending ? <LoaderCircle className="spin" size={16} /> : <BadgeCheck size={16} />}Təsdiqləyirəm</button>
        <small className="rl-hint">Səhv varsa, təsdiqləməyin — realtora yazın. Təsdiq Təhvil qeydi kimi saxlanılır; hüquqi imza deyil.</small>
      </form>}
  </PublicFrame>;
}

/* -------------------------------------------------------------------- owner */

export function OwnerConfirmPage({ token }: { token: string }) {
  const qc = useQueryClient();
  const key = ['owner-confirm', token];
  const view = useGetOwnerConfirmation(token, { query: { retry: false, refetchOnWindowFocus: false, queryKey: key } });
  const [name, setName] = useState(() => rememberedName());
  if (view.isLoading) return <PublicState loading />;
  if (!view.data) return <PublicState title="Link aktiv deyil" text="Bu qəbul linki köhnəlib və ya ləğv edilib. Realtordan yeni link istəyin." />;
  const v = view.data;
  const p = v.passport;
  const pending = p.works.filter(w => w.handoverStatus !== 'accepted').length;
  const effectiveName = name || v.ownerName;
  return <PublicFrame>
    <section className="rl-confirm-head">
      <div className="eyebrow"><KeyRound size={13} className="sm-ii" /> Ev sahibinin qəbulu</div>
      <h1 className="font-display">{pending ? `${v.ownerName ? `${v.ownerName}, ` : ''}təmir işlərini foto ilə qəbul edin` : 'Bütün işlər qəbul olunub'}</h1>
      <p><b>{p.title}</b> · {facts(p)}. Hər işin “sonra” fotolarına baxın və qəbul edin və ya düzəliş istəyin. Bütün işlər qəbul olunanda pasport ən yüksək etibar səviyyəsinə — <b>Təhvil təsdiqli</b> olur.</p>
      <div className="rl-confirm-trust"><CertifiedSeal level={p.trustLevel as Trust} /><TrustLadder level={p.trustLevel as Trust} compact /></div>
      <label className="field rl-owner-name"><span>Adınız (hər qəbulda qeyd olunur)</span><input value={name} onChange={e => setName(e.target.value)} placeholder={v.ownerName || 'Ad, soyad'} minLength={2} maxLength={120} data-testid="input-owner-name" /></label>
    </section>
    {p.works.map((w, i) => <WorkBlock key={w.id} w={w} index={i}><OwnerDecision token={token} work={w} name={effectiveName} onDone={data => { rememberName(effectiveName); qc.setQueryData(key, data); }} /></WorkBlock>)}
  </PublicFrame>;
}

function OwnerDecision({ token, work, name, onDone }: { token: string; work: PublicPassportWork; name: string; onDone: (v: OwnerConfirmView) => void }) {
  const decide = useDecideOwnerWork();
  const [mode, setMode] = useState<'idle' | 'revision'>('idle');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const noAfter = !work.afterPhotos.length;
  const send = (decision: 'accepted' | 'revision') => {
    setErr('');
    if (name.trim().length < 2) { setErr('Yuxarıda adınızı yazın.'); return; }
    decide.mutate({ token, workId: work.id, data: { decision, name: name.trim(), note: note.trim() } }, { onSuccess: v => { setMode('idle'); setNote(''); onDone(v); } });
  };
  if (work.handoverStatus === 'accepted') return <div className="rl-owner-decided ok"><Check size={15} />Siz bu işi qəbul etmisiniz.</div>;
  return <div className="rl-owner-decide">
    {work.handoverStatus === 'revision' && <div className="rl-owner-decided warn"><AlertTriangle size={15} />Düzəliş istəmisiniz. Realtor yeni foto əlavə etdikdən sonra yenidən qəbul edə bilərsiniz.</div>}
    {noAfter ? <p className="rl-warn"><AlertTriangle size={14} />Bu iş üçün hələ “sonra” fotosu yoxdur — qəbul etmək üçün realtordan foto istəyin.</p>
      : mode === 'revision' ? <div className="rl-revision-box">
        <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Nəyi düzəltmək lazımdır?" maxLength={500} aria-label="Düzəliş qeydi" />
        <div className="inline-actions"><button type="button" className="button button-quiet" onClick={() => setMode('idle')}>Ləğv et</button><button type="button" className="button button-danger" disabled={!note.trim() || decide.isPending} onClick={() => send('revision')}>Düzəliş istə</button></div>
      </div> : <div className="inline-actions">
        <button type="button" className="button button-secondary" onClick={() => setMode('revision')}>Düzəliş istə</button>
        <button type="button" className="button button-primary" disabled={decide.isPending} onClick={() => send('accepted')} data-testid={`button-accept-${work.id}`}>{decide.isPending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Fotoya baxdım, qəbul edirəm</button>
      </div>}
    {err && <small className="sm-field-error">{err}</small>}
  </div>;
}
