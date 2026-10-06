import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Info, SendHorizontal, Sparkles } from 'lucide-react';
import { ASSISTANT_PROMPTS, askAssistant } from '@/lib/smeta/ai';
import type { Project } from '@/lib/smeta/types';
import { Drawer } from './ui';

type Msg = { role: 'user' | 'ai'; text: string };

export function AssistantDrawer({ project: p, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  const ask = async (prompt: string) => {
    const q = prompt.trim();
    if (!q || busy) return;
    setMsgs(m => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const answer = await askAssistant(p, q);
      setMsgs(m => [...m, { role: 'ai', text: answer }]);
    } catch {
      setMsgs(m => [...m, { role: 'ai', text: 'Cavab hazırlamaq mümkün olmadı. Bir az sonra yenidən cəhd edin.' }]);
    } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(input); };

  return <Drawer open={open} onClose={onClose} eyebrow="Sınaq rejimi" title="AI Smeta köməkçisi" subtitle={`${p.name} · smeta v${p.estimate.version} məlumatları əsasında`}
    footer={<>
      <form className="sm-ask" onSubmit={submit}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Smeta haqqında sual verin" aria-label="Köməkçiyə sual" disabled={busy} />
        <button type="submit" className="button button-primary" disabled={busy || !input.trim()} aria-label="Göndər"><SendHorizontal size={16} /></button>
      </form>
      <div className="sm-drawer-note"><Info size={12} aria-hidden style={{ flex: '0 0 auto', marginTop: 1 }} />Cavablar mövcud smeta məlumatlarına əsaslanan ilkin tövsiyədir. Qərar verməzdən əvvəl rəqəmləri yoxlayın.</div>
    </>}>
    <div className="sm-chips" role="group" aria-label="Hazır suallar">
      {ASSISTANT_PROMPTS.map(q => <button key={q} type="button" className="sm-chip-btn" disabled={busy} onClick={() => { void ask(q); }}>{q}</button>)}
    </div>
    <div className="sm-msgs" aria-live="polite">
      {!msgs.length && <div className="sm-msg ai"><span className="sm-msg-tag"><Sparkles size={12} aria-hidden />AI KÖMƏKÇİ</span>Salam! Bu layihənin smetası, xərcləri və dəyişiklikləri əsasında suallarınıza cavab verə bilərəm. Yuxarıdakı suallardan birini seçin və ya öz sualınızı yazın.</div>}
      {msgs.map((m, i) => <div key={i} className={`sm-msg ${m.role}`}>{m.role === 'ai' && <span className="sm-msg-tag"><Sparkles size={12} aria-hidden />AI KÖMƏKÇİ</span>}{m.text}</div>)}
      {busy && <div className="sm-msg ai" aria-label="Cavab hazırlanır"><span className="sm-typing"><i /><i /><i /></span></div>}
      <div ref={endRef} />
    </div>
  </Drawer>;
}
