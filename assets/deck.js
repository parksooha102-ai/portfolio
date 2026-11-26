// 슬라이드 렌더러 — project.html?p=<폴더>. decks/<폴더>/deck.json을 읽어 16:9 장면을 그립니다.
// 틀(layout): cover · side(그림 + 오른쪽 구절) · band(그림 + 아래 구절 띠) · full(그림만) · cards · table · code
// 점검: await PFDeck.whenReady(); PFDeck.report() → { slides, overflow[], images.broken[], errors[] }
(() => {
  const W = 1600, H = 900;
  const root = document.getElementById('deck');
  const id = new URLSearchParams(location.search).get('p') || '';
  const base = `decks/${encodeURIComponent(id)}/`;
  const errors = [];
  let slides = [], cur = 0, readyResolve;
  const ready = new Promise((r) => (readyResolve = r));

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ── 시각 자료 ──
  let svgSeq = 0;
  async function loadSvg(src) {
    const txt = await fetch(base + src).then((r) => { if (!r.ok) throw new Error(`${src}: ${r.status}`); return r.text(); });
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const svg = doc.documentElement;
    const pre = `s${++svgSeq}-`;
    svg.querySelectorAll('[id]').forEach((n) => { n.id = pre + n.id; });
    svg.querySelectorAll('*').forEach((n) => {
      for (const a of ['marker-end', 'marker-start', 'clip-path', 'fill', 'href']) {
        const v = n.getAttribute(a);
        if (v && v.includes('url(#')) n.setAttribute(a, v.replace(/url\(#/g, `url(#${pre}`));
      }
    });
    const vb = (svg.getAttribute('viewBox') || '0 0 680 380').split(/\s+/).map(Number);
    svg.removeAttribute('width'); svg.removeAttribute('height');
    return { node: document.importNode(svg, true), ratio: vb[2] / vb[3] };
  }

  function figure(v) {
    const fig = el('div', 'dk-fig');
    fig.dataset.ratio = v.w && v.h ? v.w / v.h : 16 / 9;
    if (v.label) fig.append(el('div', `dk-fig-label ${v.tone || ''}`, esc(v.label)));
    if (v.svg) {
      fig.dataset.pending = '1';
      loadSvg(v.svg).then(({ node, ratio }) => {
        node.setAttribute('role', 'img'); node.setAttribute('aria-label', v.alt || '');
        fig.prepend(node); fig.dataset.ratio = ratio; delete fig.dataset.pending; fitSlide(fig.closest('.dk-slide'));
      }).catch((e) => errors.push(String(e)));
    } else {
      const img = el('img'); img.src = v.src; img.alt = v.alt || ''; img.decoding = 'async';
      img.addEventListener('error', () => errors.push(`이미지 없음: ${v.src}`));
      fig.prepend(img);
    }
    for (const c of v.callouts || []) {
      const co = el('div', `dk-co${c.dot ? ' dot' : ''}${c.align === 'right' ? ' r' : c.align === 'left' || (!c.dot && c.x < 10) ? ' l' : ''}`, esc(c.text));
      co.style.left = c.x + '%'; co.style.top = c.y + '%';
      fig.append(co);
    }
    return fig;
  }
  function visBox(s) {
    const box = el('div', 'dk-vis');
    for (const v of s.visuals || (s.visual ? [s.visual] : [])) box.append(figure(v));
    return box;
  }
  // 그림을 칸 안에 비율대로 최대한 크게(contain). 여러 장이면 같은 높이로 나란히.
  function fitSlide(slide) {
    if (!slide) return;
    const wasOn = slide.classList.contains('on');
    if (!wasOn) slide.classList.add('on');
    slide.querySelectorAll('.dk-vis').forEach((box) => {
      const figs = [...box.querySelectorAll(':scope > .dk-fig')];
      if (!figs.length) return;
      const gap = 24, label = figs.some((f) => f.querySelector('.dk-fig-label')) ? 40 : 0;
      const bw = box.clientWidth, bh = box.clientHeight - label;
      const sum = figs.reduce((a, f) => a + Number(f.dataset.ratio), 0);
      const h = Math.max(40, Math.min(bh, (bw - gap * (figs.length - 1)) / sum));
      figs.forEach((f) => { f.style.height = h + 'px'; f.style.width = h * Number(f.dataset.ratio) + 'px'; f.style.marginTop = label + 'px'; });
    });
    if (!wasOn) slide.classList.remove('on');
  }

  const pts = (list, cls = 'dk-pts') => {
    const ul = el('ul', cls);
    for (const p of list || []) ul.append(el('li', 'dk-pt', esc(p)));
    return ul;
  };

  // ── 틀 ──
  const layouts = {
    cover(s, body, deck) {
      body.className = 'dk-body dk-cover';
      const top = el('div', 'dk-cover-top');
      top.append(el('div', '', `<div class="proj">${esc(deck.title)}</div><div class="en">${esc(deck.titleEn || '')}</div>`));
      top.append(el('div', 'msg', esc(s.title)));
      const row = el('div', 'dk-cover-row');
      const r = el('div', 'dk-cover-r');
      if (s.steps) {
        const ol = el('ol', 'dk-steps');
        s.steps.forEach((t, i) => ol.append(el('li', '', `<i>${'①②③④⑤⑥'[i]}</i>${esc(t)}`)));
        r.append(ol);
      }
      const meta = el('div', 'dk-meta');
      (s.meta || []).forEach((m) => meta.append(el('span', '', esc(m))));
      r.append(meta);
      row.append(visBox(s), r);
      body.append(top, row);
    },
    side(s, body) {
      body.classList.add('dk-side');
      body.append(visBox(s));
      if (s.big) {
        const col = el('div', 'dk-sidecol');
        col.append(el('div', 'dk-big', `<b>${esc(s.big.value)}</b><span>${esc(s.big.label)}</span><small>${esc(s.big.sub || '')}</small>`));
        col.append(pts(s.points));
        body.append(col);
      } else body.append(pts(s.points));
    },
    band(s, body) { body.classList.add('dk-band'); body.append(visBox(s), pts(s.points)); },
    full(s, body) { body.classList.add('dk-full'); body.append(visBox(s)); },
    cards(s, body) {
      body.classList.add('dk-cards');
      body.append(s.lead && s.links ? el('div', 'dk-leadbar', esc(s.lead)) : el('div'));
      const row = el('div', 'dk-cardrow');
      for (const c of s.cards) {
        const card = el('div', 'dk-card');
        card.append(el('h3', '', esc(c.head)));
        if (c.rows) {
          const demo = el('div', 'dk-demo');
          for (const r of c.rows) demo.append(el('div', 'dk-chips', r.map((t) => (/^[→=+]$/.test(t) ? `<em>${t}</em>` : `<span>${esc(t)}</span>`)).join('')));
          if (c.note) demo.append(el('div', 'dk-demo-note', esc(c.note)));
          card.append(demo);
        }
        const ul = el('ul'); (c.body || []).forEach((b) => ul.append(el('li', '', esc(b)))); card.append(ul);
        row.append(card);
      }
      body.append(row);
      const tail = el('div');
      if (s.foot) tail.append(el('div', 'dk-foot', esc(s.foot)));
      if (s.links) tail.className = 'dk-links', tail.dataset.links = '1';
      body.append(tail);
    },
    table(s, body) {
      body.classList.add('dk-tablewrap');
      const t = s.table, tb = el('table', `dk-table${t.rows.length <= 3 ? ' roomy' : ''}`);
      const cls = (i) => (i === t.pick ? 'pick' : '') + (i === t.grade ? ' grade' : '');
      tb.append(el('thead', '', `<tr>${t.head.map((h, i) => `<th class="${cls(i)}">${esc(h)}</th>`).join('')}</tr>`));
      tb.append(el('tbody', '', t.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${cls(i)}${i === t.grade && /[△×]/.test(c) ? ' part' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')));
      body.append(tb);
      if (s.points) { const u = pts(s.points, 'dk-under'); body.append(u); }
      else if (s.foot) body.append(el('div', 'dk-foot', esc(s.foot)));
      else body.append(el('div'));
    },
    code(s, body) {
      body.classList.add('dk-codes');
      const row = el('div', 'dk-coderow');
      for (const c of s.code) {
        const box = el('div', 'dk-code');
        box.append(el('header', '', `<b>${esc(c.label)}</b><span>${esc(c.name)}</span>`));
        let html = c.lines.map(esc);
        if (window.hljs) {
          try { html = hljs.highlight(c.lines.join('\n'), { language: c.lang || 'csharp' }).value.split('\n'); } catch (e) { errors.push(String(e)); }
        }
        const marks = c.mark || {};
        const anyMark = Object.keys(marks).length > 0;
        box.append(el('pre', '', html.map((h, i) => {
          const m = marks[String(i + 1)];
          return `<span class="dk-ln${m ? ' mark' : ''}">${m ? `<i class="no">${esc(m)}</i>` : ''}${h || ' '}</span>`;
        }).join('')));
        row.append(box);
        if (!anyMark) box.classList.add('plain');
      }
      body.append(row, pts(s.points, 'dk-under'));
    },
  };

  function build(deck) {
    document.title = `${deck.title} · 슬라이드`;
    const stage = el('div', 'dk-stage');
    const chapters = deck.chapters || [];
    deck.slides.forEach((s, i) => {
      const sl = el('section', 'dk-slide');
      sl.dataset.n = i + 1;
      sl.setAttribute('aria-label', `${i + 1}. ${s.title}`);
      const head = el('header');
      const ch = chapters.find((c) => c.key === s.chapter);
      if (s.layout !== 'cover') {
        head.append(el('div', 'dk-ch', esc(ch ? ch.label : '')));
        head.append(el('h2', 'dk-title', esc(s.title)));
        if (s.lead && !(s.layout === 'cards' && s.links)) head.append(el('div', 'dk-lead', esc(s.lead)));
      }
      const body = el('div', 'dk-body');
      (layouts[s.layout] || layouts.full)(s, body, deck);
      const foot = el('footer', 'dk-footer');
      const ci = chapters.findIndex((c) => c.key === s.chapter);
      foot.append(el('div', 'nm', esc(deck.title)));
      foot.append(el('div', 'dk-prog', chapters.map((c, k) => `<div class="${k === ci ? 'now' : k < ci ? 'past' : ''}">${esc(c.label)}</div>`).join('')));
      foot.append(el('div', 'pg', `${i + 1} / ${deck.slides.length}`));
      sl.append(head, body, foot);
      stage.append(sl);
    });
    root.replaceChildren(stage);
    slides = [...stage.children];
    return stage;
  }

  function scale() {
    const stage = root.querySelector('.dk-stage');
    if (!stage) return;
    const k = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `scale(${k})`;
    stage.style.left = (innerWidth - W * k) / 2 + 'px';
    stage.style.top = (innerHeight - H * k) / 2 + 'px';
  }
  function go(i, push = true) {
    if (!slides.length) return;
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => s.classList.toggle('on', k === cur));
    fitSlide(slides[cur]);
    if (push) history.replaceState(null, '', `#${cur + 1}`);
  }
  const fromHash = () => Math.max(0, (parseInt(location.hash.slice(1), 10) || 1) - 1);

  addEventListener('keydown', (e) => {
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(cur + 1); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
    else if (e.key === 'Home') go(0); else if (e.key === 'End') go(slides.length - 1);
  });
  addEventListener('click', (e) => {
    if (e.target.closest('a, button') || !slides.length) return;
    go(e.clientX < innerWidth / 3 ? cur - 1 : cur + 1);
  });
  addEventListener('resize', scale);
  addEventListener('hashchange', () => go(fromHash(), false));
  addEventListener('beforeprint', () => slides.forEach(fitSlide));

  function report() {
    const out = { slides: slides.length, overflow: [], images: { broken: [] }, errors: [...errors] };
    slides.forEach((s, i) => {
      const was = s.classList.contains('on'); s.classList.add('on'); fitSlide(s);
      const chk = (node, what) => { if (node && (node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2)) out.overflow.push({ slide: i + 1, what, over: [node.scrollWidth - node.clientWidth, node.scrollHeight - node.clientHeight] }); };
      chk(s, 'slide'); chk(s.querySelector('.dk-body'), 'body');
      s.querySelectorAll('.dk-pt, .dk-card, .dk-code pre, .dk-cardrow, .dk-coderow, .dk-title').forEach((n) => chk(n, n.className));
      s.querySelectorAll('.dk-fig').forEach((f) => { if (f.offsetHeight < 200) out.overflow.push({ slide: i + 1, what: 'figure too small', h: f.offsetHeight }); });
      s.querySelectorAll('img').forEach((im) => { if (im.complete && !im.naturalWidth) out.images.broken.push({ slide: i + 1, src: im.getAttribute('src') }); });
      if (!was) s.classList.remove('on');
    });
    return out;
  }
  window.PFDeck = { whenReady: () => ready, report, go: (n) => go(n - 1) };

  async function main() {
    let deck;
    try {
      const r = await fetch(base + 'deck.json');
      if (!r.ok) throw new Error(r.status);
      deck = await r.json();
    } catch {
      root.innerHTML = `<div class="dk-empty">이 프로젝트의 슬라이드는 아직 준비 중입니다.<br><br><a href="doc.html?p=${encodeURIComponent(id)}">상세 문서 열기</a></div>`;
      readyResolve(); return;
    }
    build(deck);
    scale();
    go(fromHash(), false);
    if (deck.slides.some((s) => s.links)) {
      fetch(`data/projects/${encodeURIComponent(id)}.json`).then((r) => r.ok ? r.json() : null).then((p) => {
        const L = [[`doc.html?p=${encodeURIComponent(id)}`, '상세 문서']];
        if (p?.links?.github) L.push([p.links.github, 'GitHub']);
        if (p?.links?.video) L.push([p.links.video, '시연 영상']);
        for (const x of p?.links?.extra || []) L.push([x.url, x.label]);
        document.querySelectorAll('[data-links]').forEach((box) => { box.innerHTML = L.map(([u, t]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join(''); });
      }).catch(() => {});
    }
    await document.fonts?.ready;
    await Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    await new Promise((r) => setTimeout(r, 300));
    slides.forEach(fitSlide);
    readyResolve();
  }
  main();
})();
