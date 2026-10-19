import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, ImageIcon, LoaderCircle, Lock, Trash2, Upload } from 'lucide-react';
import { useDeleteHomeMedia, useListHomeMedia } from '@workspace/api-client-react';
import { PageHeading } from '@/components/kit';
import { Empty, HomeToaster, Skeleton, toast } from '@/components/home/ui';
import { day, refreshHomeData } from '@/lib/home/labels';
import { useHomeUpload } from '@/lib/home/upload';
import { HomeMissing, useHome } from './home-pages';

/**
 * Sənədlər: technical passport, contracts, warranty cards, plans. Stored as home media with phase "document";
 * they are private — never shown on the QR page or through share links.
 */
export function HomeDocumentsPage({ homeId }: { homeId: string }) {
  const home = useHome(homeId);
  const media = useListHomeMedia(homeId);
  const remove = useDeleteHomeMedia();
  const qc = useQueryClient();
  const { upload, busy, error } = useHomeUpload();
  const [title, setTitle] = useState('');
  if (home.isLoading || media.isLoading) return <Skeleton rows={3} />;
  if (!home.data) return <HomeMissing />;
  const role = home.data.home.myRole;
  const canAdd = ['owner', 'member', 'contributor'].includes(role);
  const docs = (media.data ?? []).filter(m => m.phase === 'document');
  const add = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    const added = await upload(list, { homeId, phase: 'document', caption: title.trim() || list[0].name.replace(/\.\w+$/, '') });
    if (added.length) { setTitle(''); void refreshHomeData(qc); toast('Sənəd əlavə olundu'); }
  };
  return <>
    <PageHeading eyebrow={home.data.home.name} title="Sənədlər" description="Texniki pasport, müqavilə, zəmanət kartı, plan — evə aid faylları bir yerdə saxlayın." />
    <p className="hp-private"><Lock size={14} />Sənədlər yalnız evə girişi olanlara görünür. QR kodla və paylaşım linki ilə heç vaxt açılmır.</p>
    {canAdd && <section className="surface hp-section hp-doc-add">
      <label className="field"><span>Sənədin adı (istəyə bağlı)</span><input value={title} onChange={e => setTitle(e.target.value)} maxLength={300} placeholder="məs. Kombinin zəmanət kartı" data-testid="input-doc-title" /></label>
      <label className={`button button-primary ${busy ? 'busy' : ''}`}>
        <input type="file" hidden multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => { void add(e.target.files); e.target.value = ''; }} disabled={busy} data-testid="input-doc-file" />
        {busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{busy ? 'Yüklənir…' : 'Sənəd əlavə et'}
      </label>
      <small className="rl-hint">PDF və ya şəkil, 50 MB-a qədər.</small>
      {error && <small className="sm-field-error" role="alert">{error}</small>}
    </section>}
    {!docs.length ? <Empty icon={<FileText size={28} />} title="Hələ sənəd yoxdur" text="Evin texniki pasportunu, müqavilələri və zəmanət kartlarını burada saxlayın — lazım olanda telefonunuzda olsun." />
      : <ul className="hp-docs">{docs.map(d => <li key={d.id} className="surface">
        <a href={d.url} target="_blank" rel="noreferrer" className="hp-doc">{d.contentType === 'application/pdf' ? <FileText size={22} /> : <ImageIcon size={22} />}<span><b>{d.caption || d.originalName}</b><small>{d.originalName} · {day(d.createdAt)}</small></span></a>
        {(d.uploadedByMe || role === 'owner' || role === 'member') && <button type="button" className="icon-button" aria-label="Sənədi sil" onClick={() => remove.mutate({ mediaId: d.id }, { onSuccess: () => { void refreshHomeData(qc); toast('Sənəd silindi'); } })}><Trash2 size={15} /></button>}
      </li>)}</ul>}
    <HomeToaster />
  </>;
}
