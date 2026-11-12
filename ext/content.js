// Puts the sky behind bsky.app (same approach as skytreeone):
//  - a fixed, click-through iframe (the extension's sky/ page in saver mode)
//    sits under everything
//  - Bluesky paints its page colour inline on many nested panels; a
//    stylesheet rule makes every panel with that inline colour transparent
//  - one translucent, blurred panel sits behind the feed column so posts stay
//    readable over the sky
//  - fly mode (the jet button, or the popup) fades Bluesky out and hands the
//    keyboard and mouse to the sky; the other jets there are posts from the
//    people you follow, and opening one comes back here to its thread
(() => {
  if (window.__fightsky) return;
  window.__fightsky = true;

  // Outside the extension (window.FIGHTSKY_TEST_BASE set) it runs with defaults.
  const ext = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome : null;
  const BASE = ext ? ext.runtime.getURL('sky/index.html') : window.FIGHTSKY_TEST_BASE;
  const ORIGIN = new URL(BASE).origin;

  let cfg = { ...FIGHTSKY_DEFAULTS };
  let frame = null, veil = null, glass = null, button = null, observer = null, timer = 0, accountTimer = 0;
  let themeBg = '', flying = false;
  let readyTimer = 0, retryTimer = 0, retried = false;
  const html = document.documentElement;

  // --- sky iframe ------------------------------------------------------------
  function skyUrl() {
    const who = me();
    const q = new URLSearchParams({
      saver: '', mins: cfg.mins, px: cfg.px, fps: cfg.fps,
      jets: cfg.jets && who ? 1 : 0, me: cfg.jets ? who : '', parent: location.origin,
    });
    return `${BASE}?${q.toString().replace('saver=', 'saver')}`;
  }

  function mountFrame() {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'fightsky-frame';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      // Sound only plays in fly mode, which starts with a click on the page.
      frame.allow = 'autoplay';
      veil = document.createElement('div');
      veil.id = 'fightsky-veil';
      glass = document.createElement('div');
      glass.id = 'fightsky-glass';
      document.body.prepend(frame, veil, glass);
      button = makeButton();
      document.body.append(button);
    }
    const url = skyUrl();
    if (frame.src !== url) load(url);
  }

  // The sky stays hidden (Bluesky's own colour shows) until it reports ready,
  // then fades in slowly, so there's never a white or bright flash. If it
  // hasn't reported in after 20 s, it's loaded once more.
  function load(url) {
    html.classList.remove('fightsky-ready');
    clearTimeout(readyTimer);
    clearTimeout(retryTimer);
    frame.src = url;
    retryTimer = setTimeout(() => {
      if (frame && !retried) { retried = true; load(frame.src); }
    }, 20000);
  }
  function onReady() {
    clearTimeout(retryTimer);
    retried = false;
    readyTimer = setTimeout(() => html.classList.add('fightsky-ready'), 1500);
  }

  function post(msg) { frame?.contentWindow?.postMessage(msg, ORIGIN); }
  function sendSound() { post({ type: 'fightsky:sound', on: cfg.sound, vol: cfg.vol, music: cfg.music }); }

  // --- who's signed in -------------------------------------------------------
  // Whose follows become jets: the handle typed in the popup, else the
  // signed-in account. Bluesky keeps its session in localStorage; only the
  // account's DID is taken from it, and nothing is stored or sent elsewhere.
  function signedInDid() {
    try {
      return JSON.parse(localStorage.getItem('BSKY_STORAGE'))?.session?.currentAccount?.did || '';
    } catch {
      return '';
    }
  }
  function me() {
    return (cfg.handle || '').trim().replace(/^@/, '') || signedInDid();
  }

  // --- fly -------------------------------------------------------------------
  // A pixel jet seen from above, drawn as rects: [x, y, width] per row.
  const JET = [[5, 0, 2], [5, 1, 2], [4, 2, 4], [4, 3, 4], [2, 4, 8], [0, 5, 12], [0, 6, 12], [4, 7, 4], [2, 8, 8], [3, 9, 2], [7, 9, 2]];
  function makeButton() {
    const b = document.createElement('button');
    b.id = 'fightsky-fly-btn';
    b.type = 'button';
    const rows = JET.map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="1"/>`).join('');
    b.innerHTML = `<svg viewBox="0 0 12 10" width="22" height="19" aria-hidden="true" shape-rendering="crispEdges">` +
      `<g fill="#9fb4c8">${rows}</g><rect x="5" y="2" width="2" height="2" fill="#2c3a48"/>` +
      `<rect x="3" y="9" width="1" height="1" fill="#ffb060"/><rect x="8" y="9" width="1" height="1" fill="#ffb060"/></svg>`;
    b.addEventListener('click', () => setFly(!flying));
    labelButton(b);
    return b;
  }
  function labelButton(b = button) {
    if (!b) return;
    const label = flying ? 'Back to the feed (Esc)' : 'Fly among the posts';
    b.title = label;
    b.setAttribute('aria-label', label);
  }

  // Bottom right, lifted above Bluesky's bottom bar and compose button. When
  // skytreeone's tree button is there too, this one sits just above it.
  function placeButton() {
    if (!button) return;
    let lift = 0;
    if (!flying) {
      const h = innerHeight;
      for (const el of document.querySelectorAll('[data-fightsky-bar], [data-skytree-bar], [data-testid="composeFAB"], #skytree-wander-btn')) {
        const r = el.getBoundingClientRect();
        if (r.height && r.top > h / 2 && r.bottom >= h - 80) lift = Math.max(lift, h - r.top + (el.id === 'skytree-wander-btn' ? 8 : 0));
      }
    }
    button.style.bottom = `${16 + lift}px`;
  }

  function setFly(on) {
    if (!frame || on === flying) return;
    flying = on;
    labelButton();
    placeButton();
    html.classList.toggle('fightsky-fly', on);
    frame.tabIndex = on ? 0 : -1;
    frame.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) {
      frame.focus();
      post('fightsky:fly');
    } else {
      post('fightsky:calm');
      frame.blur();
      window.focus();
    }
  }

  // Esc in the sky is handled there; this catches it if focus is back on the
  // page (after clicking the button or using the popup, say). Any other key
  // while flying hands focus back to the sky.
  function onKey(e) {
    if (!flying) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      setFly(false);
    } else {
      frame.focus();
    }
  }
  function onPageFocus() {
    if (flying) frame.focus();
  }

  function onFrameMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== ORIGIN) return;
    const m = e.data;
    // The sky (re)loaded: carry on flying if we were, so a reload can't leave
    // the page faded out with nothing to steer.
    if (m?.type === 'fightsky:ready') {
      onReady();
      sendSound();
      if (flying) { frame.focus(); post('fightsky:fly'); }
    } else if (m?.type === 'fightsky:leave') setFly(false);
    else if (m?.type === 'fightsky:open' && /^did:[a-z]+:[\w.:%-]+$/.test(m.did) && /^[\w.~:-]+$/.test(m.rkey)) {
      setFly(false);
      openThread(m.did, m.rkey, typeof m.handle === 'string' ? m.handle : '');
    }
  }

  // Opening a jet's post. Bluesky's router follows history changes, so a
  // pushState plus a popstate opens the thread without reloading the page (or
  // the sky). Bluesky stays hidden while the thread loads; once the post
  // itself is on the page, the page fades in showing it.
  let thread = null;
  function openThread(did, rkey, handle) {
    endThread();
    const path = `/profile/${did}/post/${rkey}`;
    html.classList.add('fightsky-opening');
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
    const t0 = Date.now();
    thread = { path, timer: 0 };
    thread.timer = setInterval(() => {
      const items = [...document.querySelectorAll('[data-testid^="postThreadItem-by-"]')];
      const anchor = items.find(e => e.querySelector('[data-testid$="-expanded"]')) ||
        items.find(e => e.dataset.testid === `postThreadItem-by-${handle}`);
      if (anchor || Date.now() - t0 > 6000) {
        clearInterval(thread.timer);
        requestAnimationFrame(() => html.classList.remove('fightsky-opening'));
      }
    }, 100);
  }
  function endThread() {
    if (!thread) return;
    clearInterval(thread.timer);
    html.classList.remove('fightsky-opening');
    thread = null;
  }
  function checkThread() {
    if (thread && location.pathname !== thread.path) endThread();
  }

  // Signing in or out changes whose follows to fly with.
  function checkAccount() {
    if (frame && frame.src !== skyUrl()) mountFrame();
  }

  // --- see-through Bluesky ---------------------------------------------------
  // A stylesheet rule with !important beats Bluesky's inline colours, and it
  // applies before the browser paints, so panels that Bluesky re-renders never
  // flash opaque. The rule is rewritten when the theme changes.
  const rootPanel = () => document.querySelector('#root [style*="min-height: 100dvh"]');
  let pageBg = '', rules = null;
  const screens = new Set();
  let checked = new WeakSet();

  function readTheme() {
    return rootPanel()?.style.backgroundColor || pageBg;
  }

  function writeRules() {
    if (!rules) {
      rules = document.createElement('style');
      rules.id = 'fightsky-rules';
      document.head.append(rules);
    }
    const sel = [];
    if (themeBg) sel.push(`html.fightsky-on #root [style*="background-color: ${themeBg};"]`);
    for (const st of screens) sel.push(`html.fightsky-on main [style="${CSS.escape(st)}"]`);
    rules.textContent = sel.length ? `${sel.join(',\n')} { background-color: transparent !important; }` : '';
  }

  // Navigation screens paint their own backdrop in a colour close to the page
  // colour: an absolute panel inside <main> that fills its parent. Its exact
  // inline style becomes a rule too. Fixed overlays (the image viewer) are
  // left alone.
  function isScreen(el) {
    if (!near(el.style.backgroundColor, themeBg)) return false;
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute' || cs.pointerEvents === 'none') return false;
    const r = el.getBoundingClientRect(), p = el.parentElement?.getBoundingClientRect();
    return !!p && r.width >= p.width * 0.95 && r.height >= p.height * 0.95;
  }

  function near(a, b) {
    const x = a.match(/[\d.]+/g), y = b.match(/[\d.]+/g);
    return !!x && !!y && x.length === 3 && [0, 1, 2].every(i => Math.abs(x[i] - y[i]) <= 40);
  }

  function sweep() {
    const t = readTheme();
    let dirty = false;
    if (t && t !== themeBg) { themeBg = t; screens.clear(); checked = new WeakSet(); dirty = true; paintGlass(); }
    if (!themeBg) return;
    for (const el of document.querySelectorAll('#root [style*="background-color"]')) {
      if (checked.has(el)) continue;
      checked.add(el);
      if (el.style.backgroundColor === themeBg) {
        const pos = getComputedStyle(el).position;
        if (pos === 'sticky' || pos === 'fixed') el.setAttribute('data-fightsky-bar', '');
        continue;
      }
      const st = el.getAttribute('style');
      if (screens.has(st) || !el.closest('main') || !isScreen(el)) continue;
      screens.add(st);
      dirty = true;
    }
    if (dirty || !rules) writeRules();
  }

  let queued = false;
  function onMutations() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sweep(); });
  }

  // --- glass behind the feed -------------------------------------------------
  function rgba(rgb, a) {
    const m = rgb.match(/[\d.]+/g);
    return m ? `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a})` : `rgba(0, 0, 0, ${a})`;
  }
  function luma(rgb) {
    const m = rgb.match(/[\d.]+/g);
    return m ? (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 : 0;
  }

  function paintGlass() {
    if (!glass) return;
    const bg = themeBg || 'rgb(0,0,0)';
    veil.style.background = rgba(bg, luma(bg) > 0.5 ? 0.45 : 0.12);
    glass.style.background = rgba(bg, cfg.glass / 100);
    glass.style.backdropFilter = cfg.blur ? `blur(${cfg.blur}px)` : 'none';
    html.style.setProperty('--fightsky-bg', bg);
    html.style.setProperty('--fightsky-bar', rgba(bg, Math.max(0.85, cfg.glass / 100)));
  }

  // The feed column: the tallest panel with Bluesky's 600px max width.
  function placeGlass() {
    placeButton();
    checkThread();
    if (!glass) return;
    let best = null, bh = 0;
    for (const el of document.querySelectorAll('[style*="max-width: 600px"]')) {
      const h = el.offsetHeight;
      if (h > bh) { bh = h; best = el; }
    }
    const r = best?.getBoundingClientRect();
    const w = r ? r.width : Math.min(600, html.clientWidth);
    const l = r ? r.left : (html.clientWidth - w) / 2;
    glass.style.left = `${l}px`;
    glass.style.width = `${w}px`;
  }

  // --- on / off --------------------------------------------------------------
  function start() {
    if (!html.classList.contains('fightsky-on')) pageBg = getComputedStyle(document.body).backgroundColor;
    html.classList.add('fightsky-on');
    mountFrame();
    sweep();
    paintGlass();
    placeGlass();
    if (!observer) {
      observer = new MutationObserver(onMutations);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      timer = setInterval(placeGlass, 500);
      accountTimer = setInterval(checkAccount, 5000);
      addEventListener('keydown', onKey, true);
      addEventListener('focus', onPageFocus);
      addEventListener('message', onFrameMessage);
      addEventListener('resize', placeGlass);
    }
  }

  function stop() {
    setFly(false);
    observer?.disconnect(); observer = null;
    clearInterval(timer);
    clearInterval(accountTimer);
    removeEventListener('keydown', onKey, true);
    removeEventListener('focus', onPageFocus);
    removeEventListener('message', onFrameMessage);
    removeEventListener('resize', placeGlass);
    frame?.remove(); veil?.remove(); glass?.remove(); button?.remove();
    frame = veil = glass = button = null;
    rules?.remove(); rules = null; screens.clear(); checked = new WeakSet();
    document.querySelectorAll('[data-fightsky-bar]').forEach(el => el.removeAttribute('data-fightsky-bar'));
    clearTimeout(readyTimer);
    clearTimeout(retryTimer);
    endThread();
    html.classList.remove('fightsky-on', 'fightsky-ready');
    themeBg = '';
  }

  function apply(changed) {
    if (!cfg.enabled) return stop();
    if (!changed || changed.some(k => FIGHTSKY_RELOAD.includes(k))) start();
    // Sound settings change live, without reloading the sky.
    if (changed?.some(k => k === 'sound' || k === 'vol' || k === 'music')) sendSound();
    paintGlass();
  }

  if (ext) {
    ext.storage.sync.get(FIGHTSKY_DEFAULTS).then(c => { cfg = c; apply(); });
    // The popup's Fly button.
    ext.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg !== 'fightsky:fly') return;
      setFly(cfg.enabled);
      reply(cfg.enabled);
    });
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const k in changes) cfg[k] = changes[k].newValue;
      apply(Object.keys(changes));
    });
  } else {
    Object.assign(cfg, window.FIGHTSKY_TEST_CFG || {});
    apply();
    window.__fightskyTest = { stop, setFly, openThread, apply: c => { Object.assign(cfg, c); apply(Object.keys(c)); } };
  }
})();
