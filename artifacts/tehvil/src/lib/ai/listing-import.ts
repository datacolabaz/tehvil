/**
 * "Təhvil-ə göndər": a bookmark the person keeps in their own browser. On a listing page it reads
 * what that browser already shows (link, title, description, visible text) and opens Təhvil with it
 * in the URL fragment. The fragment never reaches a server; the text is parsed only when Təhvil
 * reads it, and the person checks every field before anything is calculated.
 */
export interface ListingImport { url: string; title: string; description: string; text: string }

const KEY = 'tehvil-import';
const PREFIX = '#tehvil-import=';
export const IMPORT_EVENT = 'tehvil-import';

function parse(raw: string): ListingImport | null {
  try {
    const d = JSON.parse(raw) as { v?: number; u?: unknown; t?: unknown; d?: unknown; x?: unknown };
    const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
    const url = s(d.u, 2000);
    if (!/^https?:\/\//i.test(url)) return null;
    return { url, title: s(d.t, 300), description: s(d.d, 2000), text: s(d.x, 12000) };
  } catch { return null; }
}

/** Moves an import from the address bar into this tab's storage, so it survives sign-in. */
function capture(): boolean {
  if (!window.location.hash.startsWith(PREFIX)) return false;
  const raw = (() => { try { return decodeURIComponent(window.location.hash.slice(PREFIX.length)); } catch { return ''; } })();
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  if (!parse(raw)) return false;
  try { sessionStorage.setItem(KEY, raw); } catch { (window as unknown as { __tehvilImport?: string }).__tehvilImport = raw; }
  return true;
}

export function installListingImport() {
  capture();
  // The bookmark reuses one Təhvil tab: a second listing arrives as a fragment change, not a reload.
  window.addEventListener('hashchange', () => { if (capture()) window.dispatchEvent(new Event(IMPORT_EVENT)); });
}

export function takeListingImport(): ListingImport | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
  const w = window as unknown as { __tehvilImport?: string };
  if (!raw && w.__tehvilImport) { raw = w.__tehvilImport; delete w.__tehvilImport; }
  return raw ? parse(raw) : null;
}

export const importText = (d: ListingImport) => [d.title, d.description, d.text].filter(Boolean).join('\n').slice(0, 20000);

/** The bookmark itself. Kept small and dependency-free; it only reads the page and opens Təhvil. */
export function bookmarkletCode(origin: string) {
  const target = JSON.stringify(`${origin}/ai-smeta/bazar${PREFIX}`);
  return `javascript:(()=>{const m=s=>(document.querySelector(s)||{}).content||'';`
    + `const x=((document.querySelector('main')||document.body).innerText||'').replace(/[ \\t]+/g,' ').replace(/\\n\\s*\\n+/g,'\\n').slice(0,6000);`
    + `const d={v:1,u:location.href,t:m('meta[property="og:title"]')||document.title,d:m('meta[property="og:description"]')||m('meta[name="description"]'),x:x};`
    + `window.open(${target}+encodeURIComponent(JSON.stringify(d)),'tehvil');})()`;
}
