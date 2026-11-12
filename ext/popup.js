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

// Your own music loop: the MIDI file is read here, and only its notes (a few
// KB) are kept, in this browser's extension storage. Nothing is uploaded.
const loopName = document.getElementById('loop-name'), loopNote = document.getElementById('loop-note');
const pick = document.getElementById('loop-pick'), clear = document.getElementById('loop-clear'), file = document.getElementById('loop-file');
function showLoop(loop) {
  loopName.textContent = loop ? `♪ ${loop.name} · ${loop.bpm} BPM · ${loop.beats / 4} bars` : 'Built-in music';
  clear.hidden = !loop;
}
chrome.storage.local.get('midiLoop').then(r => showLoop(r.midiLoop));
pick.addEventListener('click', () => file.click());
clear.addEventListener('click', () => chrome.storage.local.remove('midiLoop').then(() => showLoop(null)));
file.addEventListener('change', async () => {
  const f = file.files[0];
  if (!f) return;
  try {
    const loop = parseMidi(await f.arrayBuffer());
    if (loop.name === 'MIDI loop') loop.name = f.name.replace(/\.midi?$/i, '');
    await chrome.storage.local.set({ midiLoop: loop });
    showLoop(loop);
    loopNote.textContent = 'Replayed with the sky’s own instruments. Kept only in this browser.';
  } catch (e) {
    loopNote.textContent = `Couldn't read that file: ${e.message}`;
  }
  file.value = '';
});
