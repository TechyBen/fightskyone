const UNITS = { vol: '%', music: '%', glass: '%', blur: ' px', mins: ' min', px: ' px', fps: ' fps' };

chrome.storage.sync.get(FIGHTSKY_DEFAULTS).then(cfg => {
  for (const key of Object.keys(FIGHTSKY_DEFAULTS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    const out = document.querySelector(`output[for="${key}"]`);
    const show = () => { if (out) out.textContent = el.value + (UNITS[key] || ''); };
    if (el.type === 'checkbox') {
      el.checked = cfg[key];
      el.addEventListener('change', () => chrome.storage.sync.set({ [key]: el.checked }));
    } else if (el.type === 'text') {
      el.value = cfg[key];
      el.addEventListener('change', () => chrome.storage.sync.set({ [key]: el.value.trim().replace(/^@/, '') }));
    } else {
      el.value = cfg[key];
      show();
      el.addEventListener('input', show);
      // Sliders that reload the sky save on release; the rest save live.
      const ev = FIGHTSKY_RELOAD.includes(key) ? 'change' : 'input';
      el.addEventListener(ev, () => chrome.storage.sync.set({ [key]: +el.value }));
    }
  }
});

// Fly: ask the content script in this tab to bring the sky to the front.
document.getElementById('fly').addEventListener('click', async () => {
  const note = document.getElementById('fly-note');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const ok = await chrome.tabs.sendMessage(tab.id, 'fightsky:fly');
    if (ok) window.close();
    else note.textContent = 'Turn on “Sky behind Bluesky” first.';
  } catch {
    note.textContent = 'Open bsky.app in this tab first.';
  }
});
