import { useEffect, useState, type FormEvent } from 'react';
import { getGetRealtorOverviewQueryKey, useGetRealtorProfile } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bell, Bot, Building2, CalendarClock, Check, CheckCircle2, Hand, LoaderCircle, MessageCircle, Repeat, Save, Server, ShieldAlert, Sparkles, UserCheck } from 'lucide-react';
import {
  getGetRealtorWhatsappQueryKey, useGetRealtorWhatsapp, useListRealtorMessages, useUpdateRealtorWhatsapp,
  type RealtorWhatsappInput, type RealtorWhatsappSettings,
} from '@workspace/api-client-react';
import { Field, PageHeading } from '@/components/kit';
import { CopyButton, Modal, Pill, QrCode, RealtorToaster, Skeleton, toast } from '@/components/realtor/ui';
import { waUrl } from '@/lib/realtor/labels';
import { relative } from '@/lib/realtor/labels';

const DEFAULTS = {
  greeting: 'Salam! Mesajınız üçün təşəkkür edirik. Sizə ən uyğun mənzili tez tapmaq üçün bir neçə qısa sual verəcəyəm.',
  followUp: 'Salam, {ad}! Mənzil axtarışınız hələ aktualdırmı? Yeni uyğun variantlar var — istəsəniz göndərim.',
  reminder: 'Salam, {ad}! Xatırlatma: {vaxt} {unvan} ünvanında görüşümüz var. Görüşənədək!',
};
const QUESTIONS = ['Alqı, yoxsa icarə?', 'Hansı rayon?', 'Büdcəniz nə qədərdir?', 'Neçə otaq?', 'Nə vaxt almaq istəyirsiniz?'];
const FLOW = [
  { icon: MessageCircle, t: 'Lead yazır' }, { icon: Bot, t: 'Avtomatik ilk cavab' }, { icon: Sparkles, t: '5 sualla filtr' },
  { icon: Building2, t: 'Uyğun elan + pasport linki' }, { icon: CalendarClock, t: 'Görüş vaxtı təklifi' }, { icon: UserCheck, t: '“Görüşə hazırdır” bildirişi' },
];

export function RealtorWhatsappPage() {
  const settings = useGetRealtorWhatsapp();
  const messages = useListRealtorMessages();
  const [connect, setConnect] = useState(() => new URLSearchParams(window.location.search).has('connect'));
  const s = settings.data;
  const connected = !!s && (s.mode === 'cloud_api' ? s.tokenSet && !!s.phoneNumberId && s.cloudApiAvailable : !!s.businessPhone);
  return <>
    <PageHeading eyebrow="WhatsApp avtomatlaşdırma" title="WhatsApp" description="Yeni leadə dərhal cavab, filtr sualları, uyğun elan, görüş təklifi və follow-up — avtomatik və ya bir kliklə." action={<button type="button" className={`button ${connected ? 'button-secondary' : 'button-primary rl-wa'}`} onClick={() => setConnect(true)} data-testid="button-connect-whatsapp"><MessageCircle size={16} />{connected ? 'Bağlantı və müştəri linki' : 'WhatsApp bağla'}</button>} />
    {s && !connected && <button type="button" className="rl-connect-banner" onClick={() => setConnect(true)}><MessageCircle size={18} /><span><b>WhatsApp-ı bağlayın və yeni leadlərə dərhal avtomatik cavab verin.</b><small>1 dəqiqə çəkir — nömrənizi yazın, rejimi seçin.</small></span><ArrowRight size={16} /></button>}
    {connect && s && <ConnectWizard s={s} onClose={() => { setConnect(false); if (window.location.search.includes('connect')) window.history.replaceState(null, '', window.location.pathname); }} />}
    <ol className="rl-flow" aria-label="Avtomatlaşdırma axını">{FLOW.map((s, i) => <li key={i}><s.icon size={16} /><span>{s.t}</span>{i < FLOW.length - 1 && <ArrowRight size={13} className="rl-flow-arrow" />}</li>)}</ol>
    {settings.isLoading || !settings.data ? <Skeleton rows={3} /> : <div className="sm-dash-grid">
      <SettingsForm s={settings.data} />
      <aside className="sm-aside">
        <div className="aside-panel">
          <div className="eyebrow">Mesaj statistikası</div>
          <dl className="rl-results">
            <div><dt>Avtomatik göndərilib</dt><dd>{settings.data.stats.sent}</dd></div>
            <div><dt>Qəbul olunub</dt><dd>{settings.data.stats.received}</dd></div>
            <div><dt>Əl ilə (hazır mətn)</dt><dd>{settings.data.stats.manual}</dd></div>
            <div><dt>Xəta</dt><dd>{settings.data.stats.failed}</dd></div>
          </dl>
        </div>
        <div className="aside-panel">
          <div className="eyebrow">Son mesajlar</div>
          <div className="rl-msg-list">{(messages.data ?? []).slice(0, 12).map(m => <Link key={m.id} href={m.leadId ? `/realtor/leads?lead=${m.leadId}` : '/realtor/leads'} className={`rl-msg ${m.direction}`}>
            <strong>{m.leadName ?? 'Lead'} <Pill small tone={m.direction === 'in' ? 'info' : m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'risk' : 'neutral'}>{m.direction === 'in' ? 'gələn' : m.status === 'sent' ? 'göndərildi' : m.status === 'failed' ? 'xəta' : 'əl ilə'}</Pill></strong>
            <small>{m.body.slice(0, 90)}{m.body.length > 90 ? '…' : ''}</small><em>{relative(m.createdAt)}</em>
          </Link>)}{!messages.data?.length && <p className="sm-muted" style={{ fontSize: 13, margin: 0 }}>Hələ mesaj yoxdur.</p>}</div>
        </div>
      </aside>
    </div>}
    <RealtorToaster />
  </>;
}

function SettingsForm({ s }: { s: RealtorWhatsappSettings }) {
  const qc = useQueryClient();
  const save = useUpdateRealtorWhatsapp();
  const init = () => ({ ...s, greeting: s.greeting || DEFAULTS.greeting, followUpText: s.followUpText || DEFAULTS.followUp, reminderText: s.reminderText || DEFAULTS.reminder, phoneNumberId: s.phoneNumberId ?? '', accessToken: '' });
  const [f, setF] = useState(init);
  useEffect(() => { setF(init()); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF(o => ({ ...o, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data: RealtorWhatsappInput = {
      mode: f.mode, businessPhone: f.businessPhone, phoneNumberId: f.phoneNumberId || null, autoReplyEnabled: f.autoReplyEnabled, greeting: f.greeting,
      followUpEnabled: f.followUpEnabled, followUpHours: Number(f.followUpHours), followUpText: f.followUpText, reminderEnabled: f.reminderEnabled,
      reminderHoursBefore: Number(f.reminderHoursBefore), reminderText: f.reminderText, workdayStartHour: Number(f.workdayStartHour), workdayEndHour: Number(f.workdayEndHour),
      followUpTemplate: f.followUpTemplate, reminderTemplate: f.reminderTemplate, templateLanguage: f.templateLanguage || 'az',
      ...(f.accessToken.trim() ? { accessToken: f.accessToken.trim() } : {}),
    };
    save.mutate({ data }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetRealtorWhatsappQueryKey() }); toast('WhatsApp ayarları yadda saxlanıldı'); } });
  };
  const connected = s.mode === 'cloud_api' && s.tokenSet && s.cloudApiAvailable && !!s.phoneNumberId;
  return <form className="rl-wa-form" onSubmit={submit}>
    <div className="surface rl-panel">
      <div className="section-head"><div><div className="eyebrow">Qoşulma</div><h2>İş rejimi</h2></div>{connected ? <Pill tone="ok" icon={<CheckCircle2 size={13} />}>WhatsApp Business qoşulub</Pill> : <Pill tone="neutral">Hazır mesaj rejimi</Pill>}</div>
      <div className="rl-mode-grid">
        <label className={`rl-mode ${f.mode === 'manual' ? 'on' : ''}`}><input type="radio" name="wa-mode" checked={f.mode === 'manual'} onChange={() => set('mode')('manual')} /><Hand size={18} /><b>Bir kliklə göndərmə</b><small>Təhvil hər mesajı hazırlayır, siz öz WhatsApp-ınızda “Göndər” basırsınız. Heç bir qoşulma tələb etmir.</small></label>
        <label className={`rl-mode ${f.mode === 'cloud_api' ? 'on' : ''} ${s.cloudApiAvailable ? '' : 'disabled'}`}><input type="radio" name="wa-mode" checked={f.mode === 'cloud_api'} disabled={!s.cloudApiAvailable} onChange={() => set('mode')('cloud_api')} /><Bot size={18} /><b>Tam avtomatik (WhatsApp Business API)</b><small>Bot gələn mesajlara özü cavab verir, sual verir, elan göndərir, görüş təyin edir.</small></label>
      </div>
      {!s.cloudApiAvailable && <p className="rl-hint"><Server size={13} className="sm-ii" /> Tam avtomatik rejim üçün server administratoru WhatsApp Cloud API açarlarını konfiqurasiya etməlidir.</p>}
      <Field label="Biznes WhatsApp nömrəniz" name="wa-phone" type="tel" value={f.businessPhone} onChange={set('businessPhone')} placeholder="+994 50 000 00 00" />
      {f.mode === 'cloud_api' && <>
        <div className="field-grid">
          <Field label="Phone number ID (Meta)" name="wa-phone-id" value={f.phoneNumberId} onChange={set('phoneNumberId')} placeholder="1234567890" />
          <Field label={s.tokenSet ? 'Access token (saxlanılıb — dəyişmək üçün yazın)' : 'Access token'} name="wa-token" type="password" value={f.accessToken} onChange={set('accessToken')} placeholder={s.tokenSet ? '••••••••' : 'EAAG…'} />
        </div>
        <div className="field"><span>Webhook URL (Meta tətbiqində qeyd edin)</span><div className="rl-url"><code>{s.webhookUrl}</code><CopyButton text={s.webhookUrl} /></div></div>
        <p className="rl-hint"><ShieldAlert size={13} className="sm-ii" /> Token şifrələnmiş saxlanılır və heç vaxt geri göstərilmir. 24 saatlıq pəncərədən kənar xatırlatma və follow-up üçün Meta-da təsdiqlənmiş şablon adı lazımdır.</p>
        <div className="field-grid three">
          <Field label="Follow-up şablonu" name="wa-fu-tpl" value={f.followUpTemplate} onChange={set('followUpTemplate')} placeholder="lead_follow_up" />
          <Field label="Xatırlatma şablonu" name="wa-rm-tpl" value={f.reminderTemplate} onChange={set('reminderTemplate')} placeholder="viewing_reminder" />
          <Field label="Şablon dili" name="wa-lang" value={f.templateLanguage} onChange={set('templateLanguage')} placeholder="az" />
        </div>
      </>}
    </div>

    <div className="surface rl-panel">
      <div className="section-head"><div><div className="eyebrow"><Bot size={12} className="sm-ii" /> Yeni lead</div><h3>Avtomatik ilk cavab və filtr sualları</h3></div><Toggle on={f.autoReplyEnabled} set={set('autoReplyEnabled')} /></div>
      <Field label="Salamlama mesajı" name="wa-greeting"><textarea rows={3} value={f.greeting} onChange={e => set('greeting')(e.target.value)} maxLength={1000} /></Field>
      <ol className="rl-q-list">{QUESTIONS.map((q, i) => <li key={q}><b>{i + 1}/5</b>{q}</li>)}</ol>
      <p className="rl-hint">Cavablardan sonra bot uyğun elanları (pasportluları pasport linki ilə) göndərir və iş saatları daxilində 3 görüş vaxtı təklif edir.</p>
      <div className="field-grid">
        <Field label="İş günü başlayır" name="wa-start"><select value={f.workdayStartHour} onChange={e => set('workdayStartHour')(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></Field>
        <Field label="İş günü bitir" name="wa-end"><select value={f.workdayEndHour} onChange={e => set('workdayEndHour')(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => h + 1).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></Field>
      </div>
    </div>

    <div className="surface rl-panel">
      <div className="section-head"><div><div className="eyebrow"><Repeat size={12} className="sm-ii" /> Cavab verməyən lead</div><h3>Follow-up mesajı</h3></div><Toggle on={f.followUpEnabled} set={set('followUpEnabled')} /></div>
      <div className="field-grid three"><Field label="Neçə saat sükutdan sonra" name="wa-fu-hours" type="number" min="4" max="336" value={f.followUpHours} onChange={v => set('followUpHours')(Number(v))} /></div>
      <Field label="Mətn ({ad} — müştərinin adı)" name="wa-fu-text"><textarea rows={3} value={f.followUpText} onChange={e => set('followUpText')(e.target.value)} maxLength={1000} /></Field>
    </div>

    <div className="surface rl-panel">
      <div className="section-head"><div><div className="eyebrow"><Bell size={12} className="sm-ii" /> Görüş</div><h3>WhatsApp xatırlatması</h3></div><Toggle on={f.reminderEnabled} set={set('reminderEnabled')} /></div>
      <div className="field-grid three"><Field label="Görüşdən neçə saat əvvəl" name="wa-rm-hours" type="number" min="1" max="72" value={f.reminderHoursBefore} onChange={v => set('reminderHoursBefore')(Number(v))} /></div>
      <Field label="Mətn ({ad}, {vaxt}, {unvan})" name="wa-rm-text"><textarea rows={3} value={f.reminderText} onChange={e => set('reminderText')(e.target.value)} maxLength={1000} /></Field>
    </div>
    <div className="rl-step-nav"><span /><button type="submit" className="button button-primary" disabled={save.isPending} data-testid="button-save-whatsapp">{save.isPending ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Yadda saxla</button></div>
  </form>;
}

function Toggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} className={`rl-switch ${on ? 'on' : ''}`} onClick={() => set(!on)}><i /><span>{on ? 'Aktiv' : 'Söndürülüb'}</span></button>;
}

/** Guided connection: number → mode → customer link. */
function ConnectWizard({ s, onClose }: { s: RealtorWhatsappSettings; onClose: () => void }) {
  const qc = useQueryClient();
  const profile = useGetRealtorProfile();
  const save = useUpdateRealtorWhatsapp();
  const [step, setStep] = useState<1 | 2 | 3>(s.businessPhone ? 3 : 1);
  const [phone, setPhone] = useState(s.businessPhone);
  const [auto, setAuto] = useState(s.autoReplyEnabled);
  const [mode, setMode] = useState(s.mode);
  useEffect(() => { if (!phone && profile.data) setPhone(profile.data.whatsapp || profile.data.phone); }, [profile.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => save.mutate({ data: {
    mode: mode === 'cloud_api' && s.cloudApiAvailable ? 'cloud_api' : 'manual', businessPhone: phone.trim(), phoneNumberId: s.phoneNumberId, autoReplyEnabled: auto,
    greeting: s.greeting || DEFAULTS.greeting, followUpEnabled: s.followUpEnabled, followUpHours: s.followUpHours, followUpText: s.followUpText || DEFAULTS.followUp,
    reminderEnabled: s.reminderEnabled, reminderHoursBefore: s.reminderHoursBefore, reminderText: s.reminderText || DEFAULTS.reminder, workdayStartHour: s.workdayStartHour,
    workdayEndHour: s.workdayEndHour, followUpTemplate: s.followUpTemplate, reminderTemplate: s.reminderTemplate, templateLanguage: s.templateLanguage || 'az',
  } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetRealtorWhatsappQueryKey() }); void qc.invalidateQueries({ queryKey: getGetRealtorOverviewQueryKey() }); setStep(3); } });
  const customerLink = waUrl(phone, 'Salam! Mənzil axtarıram.');
  return <Modal open onClose={onClose} eyebrow={`WhatsApp bağla · ${Math.min(step, 3)}/3`} title={step === 3 ? 'WhatsApp bağlandı' : 'WhatsApp-ı bağlayın'} wide>
    {step === 1 && <div className="rl-form">
      <p className="rl-welcome-lead">Bağlandıqdan sonra sistem:</p>
      <ul className="rl-check-list">
        <li><Check size={14} />Yeni leadə ilk cavabı göndərir</li><li><Check size={14} />“Alqı yoxsa icarə?” sualını verir</li>
        <li><Check size={14} />Rayon, büdcə və otaq sayını soruşur</li><li><Check size={14} />Uyğun elanı göndərir</li>
        <li><Check size={14} />Görüş vaxtı təklif edir</li><li><Check size={14} />Sizə “bu lead görüşə hazırdır” bildirişi göndərir</li>
      </ul>
      <Field label="WhatsApp nömrəniz" name="connect-phone" type="tel" required value={phone} onChange={setPhone} placeholder="+994 50 000 00 00" />
      <label className="rl-check"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /><span>Yeni leadlərə avtomatik ilk cavab və filtr sualları</span></label>
      <div className="rl-step-nav"><span /><button type="button" className="button button-primary" disabled={phone.replace(/\D/g, '').length < 9} onClick={() => setStep(2)}>Davam et<ArrowRight size={15} /></button></div>
    </div>}
    {step === 2 && <div>
      <div className="rl-mode-grid">
        <button type="button" className={`rl-mode ${mode === 'manual' ? 'on' : ''}`} onClick={() => setMode('manual')}><Hand size={18} /><b>Bir kliklə göndərmə</b><small>Dərhal işləyir. Hər mesaj hazırlanır, siz WhatsApp-da “Göndər” basırsınız. Pasport səhifəsindən gələn sorğular avtomatik lead olur.</small></button>
        <button type="button" className={`rl-mode ${mode === 'cloud_api' ? 'on' : ''} ${s.cloudApiAvailable ? '' : 'disabled'}`} disabled={!s.cloudApiAvailable} onClick={() => setMode('cloud_api')}><Bot size={18} /><b>Tam avtomatik</b><small>{s.cloudApiAvailable ? 'WhatsApp Business API: bot özü cavab verir və görüş təyin edir. Meta-dan Phone number ID və token lazımdır.' : 'Server administratoru WhatsApp Business API-ni aktivləşdirəndə açılacaq.'}</small></button>
      </div>
      <div className="rl-step-nav"><button type="button" className="button button-quiet" onClick={() => setStep(1)}>Geri</button><button type="button" className="button button-primary" disabled={save.isPending} onClick={submit} data-testid="button-connect-save">{save.isPending && <LoaderCircle className="spin" size={15} />}Bağla</button></div>
    </div>}
    {step === 3 && <div className="rl-connect-done">
      <div><p className="rl-welcome-lead"><CheckCircle2 size={16} className="sm-ii" /> {s.mode === 'cloud_api' && s.tokenSet ? 'Bot aktivdir: yeni mesajlara avtomatik cavab gedəcək.' : 'Hazırdır: hər lead üçün hazır mesajlar bir kliklə göndəriləcək.'}</p>
        <div className="eyebrow">Müştəri linkiniz</div>
        <p className="rl-hint">Instagram bio-ya, elanlara və vizit kartına qoyun — müştəri bir kliklə sizə yazır.</p>
        <div className="rl-url"><code>{decodeURIComponent(customerLink.replace(/^https:\/\//, ''))}</code><CopyButton text={customerLink} /></div>
        {mode === 'cloud_api' && !s.tokenSet && <p className="rl-warn">Tam avtomatik rejim üçün aşağıdakı formada Phone number ID və access token daxil edin.</p>}
        <div className="rl-step-nav"><button type="button" className="button button-quiet" onClick={() => setStep(1)}>Nömrəni dəyiş</button><button type="button" className="button button-primary" onClick={onClose}>Hazırdır</button></div>
      </div>
      <QrCode value={customerLink} size={150} label="Müştəri skan edib yazır" />
    </div>}
  </Modal>;
}
