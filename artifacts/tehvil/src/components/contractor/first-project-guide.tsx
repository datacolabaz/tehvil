import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export const FIRST_PROJECT_STEPS = ['Layihə məlumatlarını əlavə edin', 'Təmir işlərini seçin', 'Sifarişçiyə smetanı göndərin'] as const;

export const isGuided = () => new URLSearchParams(window.location.search).get('guide') === '1';

/** "İlk layihənizi 3 addımda yaradın" progress, shown while the new contractor builds the first estimate. */
export function FirstProjectGuide({ done, action }: { done: [boolean, boolean, boolean]; action?: ReactNode }) {
  const count = done.filter(Boolean).length;
  const pct = Math.round((count / 3) * 100);
  return <div className="ct-guide" role="status" aria-label={`İlk layihə: ${pct}% tamamlandı`} data-testid="first-project-guide">
    <strong>İlk layihəniz</strong>
    <ol>{FIRST_PROJECT_STEPS.map((s, i) => <li key={s} className={done[i] ? 'done' : ''}><span aria-hidden>{done[i] ? <Check size={12} /> : i + 1}</span>{s}</li>)}</ol>
    <span className="ct-guide-pct">{pct}%</span>
    {action}
  </div>;
}
