# YT Playlist Feed

Community connector for YouTube **playlists** (or channels) in Tapestry. Separate from the built-in **YouTube Channel** connector — which rejects playlist URLs — this one loads YouTube’s public Atom feed for `playlist_id=…`.

**Playback:** each item embeds the video in the detail view with Privacy Enhanced Mode (`youtube-nocookie.com`) and `playsinline=1`, so iOS can play in Tapestry’s WebKit view instead of handing off to the YouTube app.

**Description:** use **Video Description** → Short / Full / Off to control how much summary text appears under the embed.

**Try:** [Hardware Reviews playlist](https://www.youtube.com/playlist?list=PLJtitKU0CAegwL_3j59S7_93IEzvhYcDR)

**More info:** [github.com/newtosh/tapestry-connectors](https://github.com/newtosh/tapestry-connectors)
