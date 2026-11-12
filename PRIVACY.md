# fightskyone privacy

fightskyone has no servers of its own and no analytics. It never logs in as you and can't post, like, follow or change anything on your account.

## What it reads

- **Who you are signed in as.** To find whose follows to fly with, it reads the account ID (your DID, a public identifier like `did:plc:…`) of the account signed in to bsky.app, from the page's own storage. Nothing else from that storage is kept or sent. You can type a handle in the popup instead, or switch the jets off.
- **Who you follow.** Your follow list is fetched from Bluesky's public API (`public.api.bsky.app`), the same public data anyone can see on your profile. It's cached in the extension for six hours.
- **What the jets look like.** Each account's jet (and yours) is painted loosely in the colour of its profile picture. For that, the extension loads the small public profile picture from Bluesky's image server (`cdn.bsky.app`, which is why the extension asks to read data there). Only a single colour is kept, in memory.
- **New posts from those people.** It listens to Jetstream (`jetstream*.bsky.network`), Bluesky's public live stream of posts, filtered to the accounts you follow. Sending that list of accounts to Jetstream is how the filtering works. Only top-level posts are shown, as jets in the sky; they're held in memory and gone when you close the tab. Images in a post card load from `cdn.bsky.app` (and video thumbnails from `video.bsky.app`).

Those Bluesky services see your IP address and which accounts' pictures and posts are fetched, as any Bluesky app would. Nothing goes anywhere else.

## What it doesn't do

- No tracking, no analytics, no ads, no data sold or shared.
- It doesn't read your posts, messages, notifications or feed.
- It only runs on `bsky.app`. Apart from the jets, it only changes how the page's backgrounds look.

## Stored on your device

- Your settings (scene length, render size, an optional handle and so on) are kept in your browser's extension storage (`chrome.storage.sync`), which your browser may sync between your own devices if you're signed in to it.
- Which posts you've opened (so their jets show as read) and the cached follow list are kept in the extension's local storage.
