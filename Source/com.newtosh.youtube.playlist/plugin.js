// com.newtosh.youtube.playlist
//
// Community YouTube playlist (and channel) feeds with in-app embed playback.
// Separate from the built-in com.youtube connector: playlist Atom feeds are
// supported here; stock com.youtube rejects them.

const avatarRegex = /<link rel="image_src" href="([^"]*)">/;
const ogImageRegex = /<meta\s+property="og:image"\s+content="([^"]+)"/i;
const urlRegex = /(https?:[^\s]*)/g;
const defaultIcon = "https://www.youtube.com/s/desktop/905763c7/img/favicon_144x144.png";
const extraHeaders = {"user-agent": "WhatsApp/2"}; // avoid EU cookie nonsense
const SHORT_DESCRIPTION_CHARS = 280;

function loadIconUrl() {
	const iconUrl = require("icon-url.txt");
	if (iconUrl === false) {
		return defaultIcon;
	}
	return iconUrl;
}

const CONNECTOR_ICON = loadIconUrl();

function decodeXmlEntities(text) {
	if (text == null) {
		return null;
	}
	return String(text)
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

function createFeedIdentity() {
	const name = getItem("channelName") || "YouTube";
	const identity = Identity.createWithName(name);
	const uri = getItem("channelUri");
	if (uri != null && uri.length > 0) {
		identity.uri = uri;
	}
	identity.avatar = getItem("channelAvatar") || CONNECTOR_ICON;
	return identity;
}

// ---------------------------------------------------------------------------
// URL resolution: playlist / channel / feed → Atom feed URL
// ---------------------------------------------------------------------------

function normalizeYouTubeUrl(input) {
	let url = input.trim();

	if (url.includes("/feeds/videos.xml")) {
		if (!url.startsWith("http")) {
			url = "https://" + url;
		}
		return url;
	}

	if (!url.startsWith("http")) {
		url = "https://" + url;
	}

	url = url.replace(/\/\/m\.youtube\.com/, "//www.youtube.com");
	url = url.replace(/\/\/music\.youtube\.com/, "//www.youtube.com");

	const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]+)/);
	if (shortMatch) {
		const queryIndex = url.indexOf("?");
		const query = queryIndex >= 0 ? url.slice(queryIndex) : "";
		url = "https://www.youtube.com/watch?v=" + shortMatch[1] + query;
	}

	return url;
}

function extractPlaylistId(url) {
	const listMatch = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
	if (listMatch) {
		return listMatch[1];
	}
	const feedMatch = url.match(/playlist_id=([A-Za-z0-9_-]+)/);
	if (feedMatch) {
		return feedMatch[1];
	}
	return null;
}

async function resolveChannelId(url) {
	const channelMatch = url.match(/\/channel\/(UC[A-Za-z0-9_-]+)/);
	if (channelMatch) {
		return channelMatch[1];
	}

	const feedMatch = url.match(/channel_id=(UC[A-Za-z0-9_-]+)/);
	if (feedMatch) {
		return feedMatch[1];
	}

	const html = await sendRequest(url, "GET", null, extraHeaders);

	const rssMatch = html.match(/channel_id=(UC[A-Za-z0-9_-]+)/);
	if (rssMatch) {
		return rssMatch[1];
	}

	const jsonMatch = html.match(/"channelId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/);
	if (jsonMatch) {
		return jsonMatch[1];
	}

	const extMatch = html.match(/"externalChannelId"\s*:\s*"(UC[A-Za-z0-9_-]+)"/);
	if (extMatch) {
		return extMatch[1];
	}

	throw new Error("Could not find a YouTube channel for this URL");
}

async function getFeedUrl() {
	const cached = getItem("feedUrl");
	if (cached != null && cached.length > 0) {
		if (getItem("playlistId") == null || getItem("playlistId").length == 0) {
			const cachedPlaylistId = extractPlaylistId(cached);
			if (cachedPlaylistId != null) {
				setItem("playlistId", cachedPlaylistId);
			}
		}
		return cached;
	}

	const url = normalizeYouTubeUrl(site);

	if (url.includes("/feeds/videos.xml")) {
		const playlistId = extractPlaylistId(url);
		if (playlistId != null) {
			setItem("playlistId", playlistId);
		}
		setItem("feedUrl", url);
		return url;
	}

	const playlistId = extractPlaylistId(url);
	if (playlistId != null) {
		const feedUrl = "https://www.youtube.com/feeds/videos.xml?playlist_id=" + playlistId;
		setItem("playlistId", playlistId);
		setItem("feedUrl", feedUrl);
		setItem("feedKind", "playlist");
		return feedUrl;
	}

	const channelId = await resolveChannelId(url);
	const feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=" + channelId;
	setItem("feedUrl", feedUrl);
	setItem("feedKind", "channel");
	return feedUrl;
}

function feedBaseUrl(jsonObject) {
	const feedAttributes = jsonObject.feed.link$attrs;
	const list = (feedAttributes instanceof Array || Array.isArray(feedAttributes))
		? feedAttributes
		: (feedAttributes != null ? [feedAttributes] : []);
	for (const feedAttribute of list) {
		if (feedAttribute != null && feedAttribute.rel == "alternate") {
			return feedAttribute.href;
		}
	}
	return null;
}

function extractAvatarFromHtml(html) {
	const imageSrc = html.match(avatarRegex);
	if (imageSrc) {
		return imageSrc[1];
	}
	const ogImage = html.match(ogImageRegex);
	if (ogImage) {
		return ogImage[1];
	}
	return null;
}

async function verify() {
	const feedUrl = await getFeedUrl();
	const xml = await sendRequest(feedUrl, "GET", null, extraHeaders);
	const jsonObject = await xmlParse(xml);

	if (jsonObject.feed == null) {
		processError(Error(jsonObject.rss != null ? "Invalid feed format" : "Unknown feed format"));
		return;
	}

	let baseUrl = feedBaseUrl(jsonObject);
	const feedName = jsonObject.feed.title;
	const author = jsonObject.feed.author;
	const authorName = author != null ? author.name : feedName;
	const authorUri = author != null ? author.uri : baseUrl;

	if (baseUrl == null && authorUri != null) {
		baseUrl = authorUri;
	}
	if (baseUrl == null) {
		baseUrl = "https://www.youtube.com";
	}

	setItem("channelName", authorName);
	if (authorUri != null) {
		setItem("channelUri", authorUri);
	}

	const finish = (icon) => {
		setItem("channelAvatar", icon);
		const identity = Identity.createWithName(authorName);
		identity.uri = authorUri ?? baseUrl;
		identity.avatar = icon;
		processVerification({
			displayName: feedName,
			icon: icon,
			baseUrl: baseUrl,
			accountIdentity: identity
		});
	};

	sendRequest(baseUrl, "GET", null, extraHeaders)
	.then((html) => {
		finish(extractAvatarFromHtml(html) || CONNECTOR_ICON);
	})
	.catch((requestError) => {
		finish(CONNECTOR_ICON);
		processError(requestError);
	});
}

// Parse YouTube Atom entries directly from XML. More reliable than xmlParse for
// repeated <entry> nodes in playlist feeds.
function entriesFromAtomXml(xml) {
	const entries = [];
	const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
	let match;
	while ((match = entryRegex.exec(xml)) != null) {
		const block = match[1];
		const videoIdMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
		if (videoIdMatch == null) {
			continue;
		}
		const videoId = videoIdMatch[1];
		const titleMatch = block.match(/<media:title>([\s\S]*?)<\/media:title>/) || block.match(/<title>([\s\S]*?)<\/title>/);
		const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
		const descriptionMatch = block.match(/<media:description>([\s\S]*?)<\/media:description>/);
		const thumbMatch = block.match(/<media:thumbnail\b[^>]*\burl="([^"]+)"/);
		const widthMatch = block.match(/<media:thumbnail\b[^>]*\bwidth="([^"]+)"/);
		const heightMatch = block.match(/<media:thumbnail\b[^>]*\bheight="([^"]+)"/);

		entries.push({
			videoId: videoId,
			title: decodeXmlEntities(titleMatch ? titleMatch[1] : videoId),
			published: publishedMatch ? publishedMatch[1] : null,
			description: decodeXmlEntities(descriptionMatch ? descriptionMatch[1] : null),
			thumbnailUrl: thumbMatch ? thumbMatch[1] : (`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
			thumbnailWidth: widthMatch ? Number(widthMatch[1]) : 480,
			thumbnailHeight: heightMatch ? Number(heightMatch[1]) : 360
		});
	}
	return entries;
}

function itemUriForVideo(videoId) {
	// Include list= so these items do not collide with the same watch URLs from
	// the built-in YouTube Channel connector (Tapestry keys items by URI).
	const playlistId = getItem("playlistId");
	if (playlistId != null && playlistId.length > 0) {
		return `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`;
	}
	return `https://www.youtube.com/watch?v=${videoId}`;
}

function truncatePlainText(text, maxChars) {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxChars) {
		return normalized;
	}
	const slice = normalized.slice(0, maxChars);
	const lastSpace = slice.lastIndexOf(" ");
	const clipped = lastSpace > 80 ? slice.slice(0, lastSpace) : slice;
	return clipped.replace(/[.,;:!?-]*$/, "") + "…";
}

function descriptionMode() {
	if (typeof descriptionLength !== "undefined" && descriptionLength != null && String(descriptionLength).length > 0) {
		return String(descriptionLength).trim();
	}
	if (typeof includeDescription !== "undefined" && includeDescription == "off") {
		return "Off";
	}
	if (typeof truncateDescription !== "undefined" && truncateDescription == "off" &&
		typeof includeDescription !== "undefined" && includeDescription == "on") {
		return "Full";
	}
	return "Short";
}

function formatDescription(rawDescription) {
	if (rawDescription == null || rawDescription.length === 0) {
		return null;
	}

	const mode = descriptionMode();
	if (mode == "Off" || mode == "off") {
		return null;
	}

	let text = String(rawDescription);
	if (mode == "Short" || mode == "short" || mode == "Truncate") {
		const firstParagraph = text.split(/\n\n+/)[0] || text;
		text = truncatePlainText(firstParagraph, SHORT_DESCRIPTION_CHARS);
		const linked = text.replace(urlRegex, "<a href=\"$1\">$1</a>");
		return `<p>${linked}</p>`;
	}

	const linkedDescription = text.replace(urlRegex, "<a href=\"$1\">$1</a>");
	const paragraphs = linkedDescription.split("\n\n");
	return paragraphs.map((paragraph) => {
		const lines = paragraph.split("\n");
		const breakLines = lines.join("<br/>");
		return `<p>${breakLines}</p>`;
	}).join("\n");
}

function embedHost() {
	return privacyEnhanced != "off"
		? "https://www.youtube-nocookie.com"
		: "https://www.youtube.com";
}

function buildEmbedHtml(videoId) {
	const params = [
		"playsinline=1",
		"rel=0",
		"modestbranding=1",
		"iv_load_policy=3",
		"fs=1"
	].join("&");
	const src = `${embedHost()}/embed/${videoId}?${params}`;
	return `<iframe id="player-${videoId}" type="text/html" width="640" height="390" src="${src}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen playsinline></iframe>`;
}

function buildItem(entry) {
	const videoId = entry.videoId;
	if (videoId == null) {
		return null;
	}

	const date = entry.published != null ? new Date(entry.published) : new Date();
	if (isNaN(date.getTime())) {
		return null;
	}

	const title = entry.title || videoId;
	const uri = itemUriForVideo(videoId);
	const description = formatDescription(entry.description);
	const embed = buildEmbedHtml(videoId);

	const resultItem = Item.createWithUriDate(uri, date);
	resultItem.title = title;
	resultItem.body = description != null ? embed + description : embed;
	resultItem.author = createFeedIdentity();

	const media = MediaAttachment.createWithUrl(entry.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
	media.mimeType = "image/jpeg";
	media.text = title;
	if (entry.thumbnailWidth != null && entry.thumbnailHeight != null) {
		media.aspectSize = {width: entry.thumbnailWidth, height: entry.thumbnailHeight};
	}
	resultItem.attachments = [media];

	return resultItem;
}

async function load() {
	const feedUrl = await getFeedUrl();
	const xml = await sendRequest(feedUrl, "GET", null, extraHeaders);

	// Always parse entries from raw Atom XML for playlists/channels.
	const allEntries = entriesFromAtomXml(xml);
	allEntries.sort((a, b) => {
		const aDate = new Date(a.published || 0).getTime();
		const bDate = new Date(b.published || 0).getTime();
		return bDate - aDate;
	});

	const results = [];
	const seen = {};
	for (const entry of allEntries) {
		if (entry.videoId == null || seen[entry.videoId] == true) {
			continue;
		}
		seen[entry.videoId] = true;

		const resultItem = buildItem(entry);
		if (resultItem != null) {
			results.push(resultItem);
		}
	}

	processResults(results);
}
