// Shared by the content script and the popup (kept in chrome.storage.sync).
// eslint-disable-next-line no-unused-vars
const FIGHTSKY_DEFAULTS = {
  enabled: true,
  sound: true,   // engine, wind and effects, only while flying
  vol: 60,       // 0-100, master
  music: 50,     // 0-100, the music under it
  mins: 12,      // minutes per sky
  px: 240,       // render height in pixels
  fps: 30,       // frame cap behind the feed (fly mode runs uncapped)
  glass: 70,     // opacity of the panel behind the feed, 0-100
  blur: 6,       // blur behind the feed, px
  jets: true,    // posts from people you follow fly as jets
  handle: '',    // whose follows; blank = the account signed in to bsky.app
};

// Settings that change the sky page itself (the rest only restyle Bluesky).
// eslint-disable-next-line no-unused-vars
const FIGHTSKY_RELOAD = ['enabled', 'mins', 'px', 'fps', 'jets', 'handle'];
