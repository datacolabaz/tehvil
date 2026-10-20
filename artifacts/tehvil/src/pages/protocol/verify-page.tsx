import { AlertTriangle, CheckCircle2, CircleDashed, Info, ShieldCheck, XCircle } from 'lucide-react';
import { useVerifyProtocol } from '@workspace/api-client-react';
import { Empty, Skeleton } from '@/components/home/ui';
import { KIND_LABEL, ROLE_LABEL, STATUS_LABEL, timeAz, type Kind, type Role, type Status } from '@/lib/protocol/model';
import './protocol.css';

interface Result {
  protocol: { number: string; kind: Kind; status: Status; currentVersion: number };
  version: { version: number; frozenAt: string; current: boolean; manifestHash: string; manifestOk: boolean; finalHash: string | null; finalOk: boolean | null; pdf: { exists: boolean; ok: boolean | null } };
  photos: { total: number; ok: number; changed: number; missing: number };
  approvals: { role: Role; decision: 'approved' | 'changes' | null; at: string | null; method: string | null; sameManifest: boolean | null }[];
  allApproved: boolean;
  history: { version: number; frozenAt: string; hasManifest: boolean; approvedBy: Role[] }[];
  audit: { events: number; checked: number; legacy: number; ok: boolean; lastAt: string | null };
  trust: { sima: { status: string; note: string }; timestamp: { status: string; note: string } };
  checkedAt: string;
}
const METHOD: Record<string, string> = { phone: 'təsdiqlənmiş telefonla hesab', email: 'təsdiqlənmiş e-poçtla hesab', account: 'Tehvil.az hesabı' };

function Row({ ok, title, text, testId }: { ok: boolean | null; title: string; text: string; testId?: string }) {
  return <li className={`vf-row ${ok === true ? 'ok' : ok === false ? 'bad' : 'na'}`} data-testid={testId} data-ok={String(ok)}>
    {ok === true ? <CheckCircle2 size={18} /> : ok === false ? <XCircle size={18} /> : <CircleDashed size={18} />}
    <div><b>{title}</b><span>{text}</span></div>
  </li>;
}

/** Public page behind the QR code in a protocol PDF. Shows no names, phones, address or photos. */
export function VerifyPage({ code }: { code: string }) {
  const q = useVerifyProtocol(code, { query: { queryKey: [`/api/verify/${code}`], retry: false } });
  if (q.isLoading) return <div className="pt-page pt-public"><Skeleton rows={4} /></div>;
  if (!q.data) return <div className="pt-page pt-public"><Empty icon={<AlertTriangle size={28} />} title="Yoxlama kodu tapılmadı" text="QR kod səhv oxunub və ya bu kod Tehvil.az-da yoxdur. Bu sənədin Tehvil.az-da yaradıldığını təsdiqləmək mümkün olmadı." /></div>;
  const r = q.data.result as unknown as Result; const v = r.version;
  const allOk = v.manifestOk && r.photos.changed === 0 && r.photos.missing === 0 && v.pdf.ok !== false && v.finalOk !== false && r.audit.ok;
  return <div className="pt-page pt-public" data-testid="verify-page">
    <div className="pt-brand"><img src="/favicon.svg" alt="" width={26} height={26} />Tehvil.az · yoxlama</div>
    <div className={`vf-banner ${allOk ? 'ok' : 'bad'}`} data-testid="verify-summary">
      {allOk ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
      <div><b>{allOk ? 'Saxlanılan məlumatlar izlərlə üst-üstə düşür' : 'Uyğunsuzluq aşkar edilib'}</b>
        <span>{allOk ? 'Bu versiya dondurulduqdan sonra protokolun məzmunu və fotoları Tehvil.az-da dəyişdirilməyib.' : 'Aşağıdakı yoxlamalardan biri uğursuz olub. Sənədə etibar etməzdən əvvəl tərəflərlə və Tehvil.az ilə əlaqə saxlayın.'}</span></div>
    </div>
    <div className="pt-card">
      <ul className="pt-plain">
        <li>{KIND_LABEL[r.protocol.kind]} № <b>{r.protocol.number}</b></li>
        <li>Yoxlanılan versiya: <b>{v.version}</b> · dondurulub {timeAz(v.frozenAt)}{!v.current && <> · <b className="vf-warn">sonradan yeni versiya yaradılıb (cari: {r.protocol.currentVersion})</b></>}</li>
        <li>Cari status: <b>{STATUS_LABEL[r.protocol.status]}</b></li>
      </ul>
    </div>
    <div className="pt-card"><h3>Yoxlamalar</h3><ul className="vf-list">
      <Row ok={v.manifestOk} title="Protokol manifesti" text={v.manifestOk ? 'Saxlanılan məzmun yenidən hesablandı, SHA-256 izi uyğundur.' : 'Saxlanılan məzmunun izi manifest izinə uyğun gəlmir.'} testId="vf-manifest" />
      <Row ok={r.photos.total ? r.photos.changed === 0 && r.photos.missing === 0 : null} title={`Fotolar (${r.photos.total})`} text={r.photos.total ? `${r.photos.ok} uyğun${r.photos.changed ? ` · ${r.photos.changed} dəyişdirilib` : ''}${r.photos.missing ? ` · ${r.photos.missing} tapılmadı` : ''}. Hər faylın izi yenidən hesablandı.` : 'Bu versiyada foto yoxdur.'} testId="vf-photos" />
      <Row ok={v.pdf.ok} title="PDF faylı" text={!v.pdf.exists ? 'Bu versiya üçün PDF hələ yaradılmayıb.' : v.pdf.ok === null ? 'PDF izi qeydə alınmayıb.' : v.pdf.ok ? 'Saxlanılan PDF faylının izi uyğundur.' : 'Saxlanılan PDF faylı dəyişib.'} testId="vf-pdf" />
      <Row ok={v.finalOk} title="Təsdiqlər qeydi" text={v.finalOk === null ? 'Hər iki tərəfin təsdiqi ilə yekun qeyd hələ yaradılmayıb.' : v.finalOk ? 'Təsdiqlər manifestə bağlıdır və qeydin izi uyğundur.' : 'Təsdiqlər qeydi dəyişib.'} testId="vf-final" />
      <Row ok={r.audit.checked ? r.audit.ok : null} title="Audit tarixçəsi" text={`${r.audit.events} hadisə${r.audit.checked ? ` · ${r.audit.checked} hadisə zəncirvari izlə yoxlandı — ${r.audit.ok ? 'zəncir bütövdür' : 'zəncir qırılıb'}` : ''}${r.audit.legacy ? ` · ${r.audit.legacy} köhnə hadisə zəncirdən əvvəldir` : ''}.`} testId="vf-audit" />
    </ul>
      <p className="rl-hint">Manifest izi: <code className="vf-hash" data-testid="vf-hash">{v.manifestHash}</code></p>
      {v.finalHash && <p className="rl-hint">Təsdiqlər qeydinin izi: <code className="vf-hash">{v.finalHash}</code></p>}
      <p className="rl-hint">PDF-dəki izlə müqayisə edin. Yoxlama vaxtı: {timeAz(r.checkedAt)}.</p>
    </div>
    <div className="pt-card"><h3>Tərəflərin təsdiqi</h3><ul className="vf-list">
      {r.approvals.map((a) => <Row key={a.role} ok={a.decision === 'approved' && a.sameManifest !== false ? true : a.decision ? false : null} title={ROLE_LABEL[a.role]} testId={`vf-approval-${a.role}`}
        text={a.decision === 'approved' ? `Təsdiqləyib · ${timeAz(a.at!)} · ${METHOD[a.method ?? ''] ?? a.method}${a.sameManifest === false ? ' · başqa manifestə!' : ''}` : a.decision === 'changes' ? `Düzəliş istəyib · ${timeAz(a.at!)}` : 'Bu versiyanı təsdiqləməyib'} />)}
    </ul><p className="rl-hint">Təsdiq Tehvil.az hesabı ilə verilir; ixtisaslı elektron imza deyil.</p></div>
    <div className="pt-card"><h3>Versiyalar</h3><ul className="pt-plain" data-testid="vf-history">{r.history.map((h) => <li key={h.version}>Versiya {h.version} · {timeAz(h.frozenAt)} · {h.approvedBy.length ? `təsdiqləyib: ${h.approvedBy.map((x) => ROLE_LABEL[x]).join(', ')}` : 'təsdiq yoxdur'}{!h.hasManifest && ' · manifestdən əvvəlki versiya'}</li>)}</ul></div>
    <div className="pt-card vf-limits"><h3><Info size={16} />Bu yoxlama nəyi göstərmir</h3><ul className="pt-plain">
      <li>Fotonun real olaraq nə vaxt və harada çəkildiyini təsdiqləmir — iz yalnız faylın sonradan dəyişib-dəyişmədiyini göstərir.</li>
      <li>Sənədin hüquqi qüvvəsinə zəmanət vermir. QR kod imza deyil.</li>
      <li>{r.trust.sima.note}</li>
      <li>{r.trust.timestamp.note}</li>
    </ul></div>
  </div>;
}
