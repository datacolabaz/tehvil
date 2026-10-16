import { useState } from 'react';
import { attachRealtorMedia, requestUploadUrl, type RealtorMedia } from '@workspace/api-client-react';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_EDGE = 2200;

/** Large photos are downscaled in the browser so passport pages stay fast on mobile data. */
async function prepare(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4_000_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

export class UploadError extends Error {}

export async function uploadPhotos(files: File[]): Promise<RealtorMedia[]> {
  const bad = files.find(f => !ACCEPTED.includes(f.type));
  if (bad) throw new UploadError(`"${bad.name}" dəstəklənmir. JPG, PNG və ya WebP şəkil seçin.`);
  const inputs = [];
  for (const original of files) {
    const file = await prepare(original);
    if (file.size > 15 * 1024 * 1024) throw new UploadError(`"${file.name}" 15 MB-dan böyükdür.`);
    const meta = await requestUploadUrl({ name: file.name, size: file.size, contentType: file.type });
    const put = await fetch(meta.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }).catch(() => null);
    if (!put?.ok) throw new UploadError('Şəkil yüklənmədi. İnternet bağlantısını yoxlayıb yenidən cəhd edin.');
    inputs.push({ objectPath: meta.objectPath, originalName: file.name, contentType: file.type, size: file.size });
  }
  return attachRealtorMedia({ files: inputs });
}

export function usePhotoUpload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (files: File[]) => {
    if (!files.length) return [];
    setBusy(true); setError('');
    try { return await uploadPhotos(files); }
    catch (e) { setError(e instanceof UploadError ? e.message : 'Şəkil yüklənmədi. Yenidən cəhd edin.'); return []; }
    finally { setBusy(false); }
  };
  return { upload, busy, error, setError };
}
