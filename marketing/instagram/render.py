# -*- coding: utf-8 -*-
"""Renders the Instagram carousels, highlight covers and highlight stories to JPEG (9:16 and 4:5 crop)."""
import asyncio, html, os, sys
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from content import DAYS, HIGHLIGHTS

ROOT = Path(__file__).parent
OUT = ROOT / "out"; (OUT / "916").mkdir(parents=True, exist_ok=True); (OUT / "45").mkdir(exist_ok=True); (OUT / "hl").mkdir(exist_ok=True)
FONTS = ROOT / "node_modules/@fontsource"
ICONS = ROOT / "node_modules/lucide-static/icons"
e = lambda s: html.escape(s or "")

def icon(name, size=40, color="currentColor", stroke=2):
    svg = (ICONS / f"{name}.svg").read_text()
    svg = svg.replace('width="24"', f'width="{size}"').replace('height="24"', f'height="{size}"').replace('stroke="currentColor"', f'stroke="{color}"').replace('stroke-width="2"', f'stroke-width="{stroke}"')
    return svg[svg.index("<svg"):]

FACES = "".join(f"""@font-face{{font-family:'{fam}';font-weight:{w};src:url('file://{FONTS}/{pkg}/files/{pkg}-{sub}-{w}-normal.woff2') format('woff2');{rng}}}"""
  for fam, pkg in [("Manrope", "manrope"), ("DM Sans", "dm-sans")] for w in (400, 500, 700, 800)
  for sub, rng in [("latin", ""), ("latin-ext", "")] if (FONTS / pkg / "files" / f"{pkg}-{sub}-{w}-normal.woff2").exists())

CSS = FACES + """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px}
body{font-family:'DM Sans',sans-serif;color:#1f3d33;background:#f4efe4;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased}
body.dark{background:#1f3d33;color:#f4efe4}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(31,61,51,.10) 1.6px,transparent 1.6px);background-size:36px 36px}
body.dark .dots{background-image:radial-gradient(rgba(244,239,228,.08) 1.6px,transparent 1.6px)}
.blob{position:absolute;border-radius:50%;filter:blur(2px)}
.safe{position:absolute;left:0;top:285px;width:1080px;height:1350px;padding:92px 92px 84px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:56px}
.eyebrow{display:inline-flex;align-items:center;gap:14px;font:700 30px 'DM Sans';letter-spacing:.06em;text-transform:uppercase;color:#6a6458}
body.dark .eyebrow{color:#c9d5cc}
.eyebrow i{width:14px;height:14px;border-radius:50%;background:#c27d55;display:block}
.pager{display:flex;gap:10px}.pager b{width:14px;height:14px;border-radius:50%;background:rgba(31,61,51,.18)}.pager b.on{background:#1f3d33;width:38px;border-radius:8px}
body.dark .pager b{background:rgba(244,239,228,.25)} body.dark .pager b.on{background:#f4efe4}
h1{font:800 104px/1.04 'Manrope';letter-spacing:-.045em;white-space:pre-line}
h2{font:800 74px/1.08 'Manrope';letter-spacing:-.04em}
h3{font:800 62px/1.1 'Manrope';letter-spacing:-.035em;margin-bottom:44px}
.sub{font:500 46px/1.3 'DM Sans';color:#6a6458;margin-top:40px}
body.dark .sub{color:#c9d5cc}
.body p{font:400 39px/1.45 'DM Sans';color:#3d4a44;margin-top:30px}
body.dark .body p{color:#dfe7e1}
.grow{flex:1;display:flex;flex-direction:column}
.center{justify-content:center}
.foot{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:36px}
.brand{display:flex;align-items:center;gap:16px;font:800 34px 'Manrope';letter-spacing:-.04em}
.mark{width:58px;height:58px;border-radius:16px;background:#1f3d33;color:#f4efe4;display:grid;place-items:center;font:800 34px 'Manrope'}
body.dark .mark{background:#f4efe4;color:#1f3d33}
.swipe{display:flex;align-items:center;gap:12px;font:600 30px 'DM Sans';color:#6a6458}
body.dark .swipe{color:#c9d5cc}
.rows{display:flex;flex-direction:column;gap:22px}
.row{display:flex;gap:28px;align-items:center;background:#fff;border:2px solid #e6dfd0;border-radius:30px;padding:30px 34px}
.row .ic{width:86px;height:86px;flex:0 0 86px;border-radius:24px;background:#e4ece6;display:grid;place-items:center}
.row b{display:block;font:700 40px 'Manrope';letter-spacing:-.02em}.row small{display:block;font:400 31px/1.3 'DM Sans';color:#6a6458;margin-top:6px}
.cta{margin-top:56px;display:inline-flex;align-self:flex-start;align-items:center;gap:16px;background:#f4efe4;color:#1f3d33;border-radius:999px;padding:26px 44px;font:800 38px 'Manrope';letter-spacing:-.02em}
body:not(.dark) .cta{background:#1f3d33;color:#f4efe4}
/* phone */
.phone-wrap{flex:1;display:flex;justify-content:center;align-items:flex-start;margin-top:8px;overflow:hidden}
.phone{width:600px;border:16px solid #1c2925;border-bottom:0;border-radius:64px 64px 0 0;background:#f8f5ee;padding:40px 30px 0;height:820px;overflow:hidden;box-shadow:0 30px 80px rgba(31,61,51,.18)}
.p-home{font:700 22px 'DM Sans';letter-spacing:.06em;text-transform:uppercase;color:#7a756b}
.p-h{font:800 40px/1.15 'Manrope';letter-spacing:-.03em;margin:8px 0 14px}
.chip{display:inline-block;font:600 21px 'DM Sans';padding:7px 16px;border-radius:999px;background:#ece6da;color:#5b574f}
.chip.ok{background:#dcefe3;color:#174d36}.chip.wait{background:#fbeccf;color:#8a5a00}.chip.run{background:#e1e9f8;color:#2a4f8a}
.p-btn{display:flex;align-items:center;justify-content:center;gap:14px;border-radius:22px;padding:28px;font:800 30px 'Manrope';margin-top:16px}
.p-btn.dark{background:#1f3d33;color:#fff}.p-btn.light{background:#ebe6dc;color:#1f3d33}
.st{display:flex;gap:18px;align-items:center;background:#fff;border:2px solid #e8e2d5;border-radius:24px;padding:16px;margin-bottom:14px}
.th{width:92px;height:92px;border-radius:18px;flex:0 0 92px}
.st b{display:block;font:800 27px 'Manrope';letter-spacing:-.02em}.st small{display:block;font:400 21px 'DM Sans';color:#7a756b;margin:4px 0 8px}
.okbox{background:#dcefe3;color:#174d36;border-radius:20px;padding:24px;font:800 30px 'Manrope';margin:20px 0 4px;display:flex;flex-direction:column;gap:10px}
.photo{height:330px;border-radius:24px;margin:6px 0 20px}
.facts{display:flex;flex-direction:column;gap:16px}
.facts div{background:#fff;border:2px solid #e8e2d5;border-radius:20px;padding:18px 22px}
.facts dt{font:700 20px 'DM Sans';letter-spacing:.05em;text-transform:uppercase;color:#8a8478}
.facts dd{font:700 29px 'Manrope';margin-top:4px;letter-spacing:-.01em}.facts small{font:500 21px 'DM Sans';color:#7a756b}
.tog{display:flex;justify-content:space-between;align-items:center;background:#fff;border:2px solid #e8e2d5;border-radius:20px;padding:20px 24px;margin-bottom:12px;font:700 27px 'Manrope'}
.tog span{font:600 22px 'DM Sans';padding:6px 14px;border-radius:999px}.tog .y{background:#dcefe3;color:#174d36}.tog .n{background:#efe9de;color:#7a756b}
.linkbox{background:#1f3d33;color:#f4efe4;border-radius:20px;padding:22px 24px;font:600 25px 'DM Sans';margin-top:16px}
.bar{height:12px;border-radius:6px;background:#e8e2d5;margin-top:10px;overflow:hidden}.bar i{display:block;height:100%;background:#2f6f55;border-radius:6px}
.room{display:flex;gap:16px;align-items:center;background:#fff;border:2px solid #e8e2d5;border-radius:22px;padding:18px;margin-bottom:12px}
.room em{width:40px;height:40px;border-radius:50%;flex:0 0 40px;display:grid;place-items:center}
.room b{display:block;font:800 26px 'Manrope'}.room small{font:400 21px 'DM Sans';color:#7a756b}
.meta{font:500 23px 'DM Sans';color:#3d4a44;margin:10px 4px;display:flex;gap:10px;align-items:center}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.sign span{border-radius:16px;padding:16px;text-align:center;font:800 24px 'Manrope'}
/* flow, steps */
.flow{display:flex;flex-direction:column;gap:18px}
.fl{display:flex;align-items:center;gap:24px;background:#fff;border:2px solid #e6dfd0;border-radius:28px;padding:28px 32px;font:800 42px 'Manrope';letter-spacing:-.02em}
.fl small{display:block;font:400 28px 'DM Sans';color:#6a6458;letter-spacing:0;margin-top:4px}
.fl .n{width:64px;height:64px;flex:0 0 64px;border-radius:50%;display:grid;place-items:center}
.arrow{align-self:center;color:#b5ab98}
.split{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.steps{display:flex;flex-direction:column;gap:24px}
.stp{display:flex;gap:30px;align-items:center;background:#fff;border:2px solid #e6dfd0;border-radius:32px;padding:38px 36px}
.stp .num{width:92px;height:92px;flex:0 0 92px;border-radius:28px;background:#1f3d33;color:#f4efe4;display:grid;place-items:center;font:800 46px 'Manrope'}
.stp b{display:block;font:800 46px 'Manrope';letter-spacing:-.03em}.stp small{display:block;font:400 32px 'DM Sans';color:#6a6458;margin-top:6px}
/* highlights */
.hl-cover{position:absolute;inset:0;display:grid;place-items:center}
.hl-circle{width:620px;height:620px;border-radius:50%;background:#1f3d33;display:grid;place-items:center;box-shadow:0 0 0 22px rgba(31,61,51,.10)}
.hl-name{position:absolute;bottom:420px;left:0;right:0;text-align:center;font:800 64px 'Manrope';letter-spacing:-.03em}
.story{position:absolute;inset:0;padding:260px 96px 240px;display:flex;flex-direction:column}
.story .ic{width:150px;height:150px;border-radius:44px;background:#1f3d33;display:grid;place-items:center;margin-bottom:64px}
body.dark .story .ic{background:#f4efe4}
.story h2{font-size:96px}
.story p{font:400 50px/1.42 'DM Sans';margin-top:48px;color:#3d4a44}
body.dark .story p{color:#dfe7e1}
.story .cnt{margin-top:auto;display:flex;justify-content:space-between;align-items:center}
"""

def thumb(c1, c2): return f"background:linear-gradient(135deg,{c1},{c2})"
TONES = [("#c8b89b", "#8f7f63"), ("#9ea7a0", "#5f6d64"), ("#d2b48f", "#a2794f"), ("#b9c1c7", "#7b8791"), ("#d9cdb7", "#b3a283")]

def screen(kind):
    if kind == "timeline":
        rows = [("Bünövrə", "12 foto · 14 mar 2026", "Qəbul edilib", "ok", 0), ("Armatur işləri", "8 foto · 2 apr 2026", "Qəbul edilib", "ok", 1),
                ("Divarların hörülməsi", "15 foto · 28 may 2026", "Yoxlanış gözləyir", "wait", 2), ("Elektrik xətləri", "6 foto · 19 iyn 2026", "Davam edir", "run", 3), ("Suvaq işləri", "hələ foto yoxdur", "Başlanmayıb", "", 4)]
        body = "".join(f'<div class="st"><div class="th" style="{thumb(*TONES[t])}"></div><div><b>{e(n)}</b><small>{e(s)}</small><span class="chip {c}">{e(st)}</span></div></div>' for n, s, st, c, t in rows)
        return f'<div class="p-home">Yasamal, 3 otaqlı</div><div class="p-h">Ev tarixçəsi</div>{body}'
    if kind in ("invite", "success"):
        top = '<div class="p-home">Xırdalan həyət evi</div><div class="p-h">Bünövrə mərhələsi</div><span class="chip run">Davam edir</span>'
        if kind == "invite":
            return top + f'<div class="photo" style="{thumb(*TONES[0])};height:250px;margin-top:22px"></div><div class="p-btn dark">{icon("camera",34,"#fff")}Foto çək</div><div class="p-btn light">{icon("image-plus",32,"#1f3d33")}Şəkil yüklə</div><div class="meta" style="justify-content:center;margin-top:18px;color:#7a756b">Hesab lazım deyil</div>'
        return top + f'<div class="okbox">{icon("circle-check",40,"#174d36")}Foto uğurla əlavə edildi.</div><div class="p-btn dark">{icon("camera",34,"#fff")}Daha bir foto çək</div><div class="p-btn light">{icon("image-plus",32,"#1f3d33")}Şəkil yüklə</div>'
    if kind == "facts":
        return f'<div class="p-home">Bünövrə</div><div class="photo" style="{thumb(*TONES[2])};margin-top:14px"></div><dl class="facts"><div><dt>Yüklənib</dt><dd>14 mar 2026, 10:42 <small>· server</small></dd></div><div><dt>Çəkilib</dt><dd>14 mar 2026, 10:35 <small>· cihazın məlumatı</small></dd></div><div><dt>Məkan</dt><dd style="color:#1f6f4c">GPS qeydə alınıb <small>· icazə ilə</small></dd></div></dl>'
    if kind == "share":
        t = lambda n, y: f'<div class="tog">{e(n)}<span class="{"y" if y else "n"}">{"görünür" if y else "gizli"}</span></div>'
        return f'<div class="p-home">Alıcı üçün link</div><div class="p-h">Nəyi göstərək?</div>{t("Mərhələlər", 1)}{t("Fotolar və tarixlər", 1)}{t("GPS nişanı", 1)}{t("Ünvan", 0)}{t("Xərclər, telefonlar", 0)}<div class="linkbox">tehvil.az/h/s/•••••••• · 30 gün<br><span style="opacity:.75">Hesab tələb etmir · istənilən vaxt bağlanır</span></div>'
    if kind == "homes":
        hs = [("Yasamal, 3 otaqlı", 9, 0), ("Xırdalan həyət evi", 4, 2), ("Nəsimi, yeni tikili", 12, 1), ("Badamdar villa", 6, 3)]
        body = "".join(f'<div class="st"><div class="th" style="{thumb(*TONES[t])}"></div><div style="flex:1"><b>{e(n)}</b><small>{d}/14 mərhələ · alıcıya link hazırdır</small><div class="bar"><i style="width:{int(d/14*100)}%"></i></div></div></div>' for n, d, t in hs)
        return f'<div class="p-home">Rieltor</div><div class="p-h">Müştəri evləri</div>{body}'
    if kind == "protocol":
        rooms = [("Qonaq otağı", "Yaxşı · 4 foto", "#2f7a55"), ("Mətbəx", "Qüsurlu · kran damcılayır", "#b2462f"), ("Hamam və tualet", "Qənaətbəxş · 3 foto", "#b68630"), ("Dəhliz", "yoxlanmayıb", "")]
        body = "".join(f'<div class="room"><em style="{"background:"+c if c else "border:3px solid #cfc7b7"}">{icon("check",24,"#fff",3) if c else ""}</em><div><b>{e(n)}</b><small>{e(s)}</small></div></div>' for n, s, c in rooms)
        return f'<div class="p-home">Təhvil protokolu</div>{body}<div class="meta">{icon("gauge",26,"#3d4a44")}Su: 00342,6 · Qaz: 1290</div><div class="meta">{icon("key-round",26,"#3d4a44")}Açar: 3 · Domofon çipi: 2</div><div class="sign"><span style="background:#dcefe3;color:#174d36">Satıcı ✓</span><span style="background:#efe6d6;color:#6a6458">Alıcı …</span></div>'
    return ""

def flow():
    st = [("Davam edir", "usta işləyir, foto əlavə edir", "#e1e9f8", "#2a4f8a", "loader"), ("Yoxlanış gözləyir", "usta “tamamlandı” dedi", "#fbeccf", "#8a5a00", "hourglass")]
    out = '<div class="flow">' + "".join(f'<div class="fl"><span class="n" style="background:{bg}">{icon(ic,34,fg)}</span><div>{e(t)}<small>{e(s)}</small></div></div><div class="arrow">{icon("arrow-down",40,"#b5ab98")}</div>' for t, s, bg, fg, ic in st)
    out += f'<div class="split"><div class="fl" style="flex-direction:column;align-items:flex-start;gap:14px;border-color:#bcdcc8"><span class="n" style="background:#dcefe3">{icon("check",34,"#174d36",3)}</span><div>Qəbul edilib<small>yalnız siz</small></div></div><div class="fl" style="flex-direction:column;align-items:flex-start;gap:14px;border-color:#f0cbc1"><span class="n" style="background:#fbe6e1">{icon("rotate-ccw",32,"#7d2614")}</span><div>Düzəliş tələb olunur<small>səbəbi ilə</small></div></div></div></div>'
    return out

def steps():
    s = [("1", "Ev əlavə edin", "Yalnız ad kifayətdir"), ("2", "Mərhələni seçin", "Hazır siyahıdan və ya öz adınızla"), ("3", "Foto çəkin", "Tarix özü yazılır")]
    return '<div class="steps">' + "".join(f'<div class="stp"><span class="num">{n}</span><div><b>{e(t)}</b><small>{e(d)}</small></div></div>' for n, t, d in s) + "</div>"

def page(inner, dark=False):
    blobs = '' if dark else '<div class="blob" style="width:520px;height:520px;right:-180px;top:-160px;background:#e7dfcf"></div><div class="blob" style="width:420px;height:420px;left:-160px;bottom:-140px;background:#e2e8df"></div>'
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body class="{"dark" if dark else ""}"><div class="dots"></div>{blobs}{inner}</body></html>'

def slide_html(day, i, s):
    dark = s["t"] == "cta"
    pager = '<div class="pager">' + "".join(f'<b class="{"on" if k == i else ""}"></b>' for k in range(3)) + "</div>"
    top = f'<div class="top"><span class="eyebrow"><i></i>{e(s["eyebrow"])}</span>{pager}</div>'
    swipe = f'<span class="swipe">sürüşdürün {icon("arrow-right",32,"currentColor")}</span>' if i < 2 else '<span class="swipe">link bio-da</span>'
    foot = f'<div class="foot"><span class="brand"><span class="mark">t.</span>tehvil.az</span>{swipe}</div>'
    t = s["t"]
    if t == "hook": mid = f'<div class="grow center"><h1>{e(s["title"])}</h1>{f"<p class=sub>{e(s['sub'])}</p>" if s.get("sub") else ""}</div>'
    elif t == "text": mid = f'<div class="grow"><h2>{e(s["title"])}</h2><div class="body">{"".join(f"<p>{e(p)}</p>" for p in s["body"])}</div></div>'
    elif t == "list": mid = f'<div class="grow"><h3>{e(s["title"])}</h3><div class="rows">{"".join(f"<div class=row><span class=ic>{icon(ic,46,'#1f3d33')}</span><div><b>{e(a)}</b><small>{e(b)}</small></div></div>" for ic, a, b in s["rows"])}</div></div>'
    elif t == "phone": mid = f'<div class="grow"><h3 style="margin-bottom:34px">{e(s["title"])}</h3><div class="phone-wrap"><div class="phone">{screen(s["screen"])}</div></div></div>'
    elif t == "flow": mid = f'<div class="grow"><h3>{e(s["title"])}</h3>{flow()}</div>'
    elif t == "steps": mid = f'<div class="grow"><h3>{e(s["title"])}</h3>{steps()}</div>'
    else: mid = f'<div class="grow center"><h2>{e(s["title"])}</h2><div class="body"><p>{e(s["body"])}</p></div>{"<span class=cta>tehvil.az</span>" if i == 2 else ""}</div>'
    if t == "phone": foot = foot.replace('class="foot"', 'class="foot" style="padding-top:0;margin-top:0;position:absolute;left:92px;right:92px;bottom:84px;background:linear-gradient(transparent,#f4efe4 40%);padding-top:40px"')
    return page(f'<div class="safe">{top}{mid}{foot}</div>', dark)

def hl_cover(h):
    return page(f'<div class="hl-cover"><div class="hl-circle">{icon(h["icon"],300,"#f4efe4",1.8)}</div></div><div class="hl-name">{e(h["name"])}</div>')

def hl_story(h, k, st):
    dark = k % 2 == 1
    col = "#1f3d33" if dark else "#f4efe4"
    n = len(h["stories"])
    return page(f'<div class="story"><span class="eyebrow"><i></i>{e(h["name"])} · {k+1}/{n}</span><div style="flex:1;display:flex;flex-direction:column;justify-content:center"><div class="ic">{icon(h["icon"],80,col)}</div><h2>{e(st["title"])}</h2><p>{e(st["body"])}</p></div><div class="cnt"><span class="brand"><span class="mark">t.</span>tehvil.az</span></div></div>', dark)

async def main():
    jobs = []
    for d, day in enumerate(DAYS, 1):
        for i, s in enumerate(day["slides"]):
            jobs.append((f"916/gun{d:02d}-{i+1}.jpg", slide_html(d, i, s), True))
    for h in HIGHLIGHTS:
        jobs.append((f"hl/{h['key']}-cover.jpg", hl_cover(h), False))
        for k, st in enumerate(h["stories"]):
            jobs.append((f"hl/{h['key']}-{k+1}.jpg", hl_story(h, k, st), False))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        pg = await b.new_page(viewport={"width": 1080, "height": 1920})
        for name, doc, crop in jobs:
            f = ROOT / "tmp.html"; f.write_text(doc)
            await pg.goto(f"file://{f}"); await pg.evaluate("document.fonts.ready")
            png = ROOT / "tmp.png"; await pg.screenshot(path=str(png))
            im = Image.open(png).convert("RGB"); im.save(OUT / name, "JPEG", quality=90, optimize=True)
            if crop: im.crop((0, 285, 1080, 1635)).save(OUT / "45" / Path(name).name, "JPEG", quality=90, optimize=True)
        await b.close()
    print(len(jobs), "images")
asyncio.run(main())
