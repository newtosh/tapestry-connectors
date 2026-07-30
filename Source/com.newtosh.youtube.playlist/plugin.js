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

function asArray(value) {
	if (value == null) {
		return [];
	}
	if (value instanceof Array || Array.isArray(value)) {
		return Array.prototype.slice.call(value);
	}
	// Some JS bridges expose array-like objects instead of real Arrays.
	if (typeof value === "object" && typeof value.length === "number" && value.length >= 0) {
		const copy = [];
		for (let i = 0; i < value.length; i++) {
			copy.push(value[i]);
		}
		if (copy.length > 0) {
			return copy;
		}
	}
	// Numeric-key objects (e.g. {0: a, 1: b}).
	if (typeof value === "object") {
		const keys = Object.keys(value).filter((key) => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b));
		if (keys.length > 1) {
			return keys.map((key) => value[key]);
		}
	}
	return [value];
}

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
		return cached;
	}

	const url = normalizeYouTubeUrl(site);

	if (url.includes("/feeds/videos.xml")) {
		setItem("feedUrl", url);
		return url;
	}

	const playlistId = extractPlaylistId(url);
	if (playlistId != null) {
		const feedUrl = "https://www.youtube.com/feeds/videos.xml?playlist_id=" + playlistId;
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
	if (feedAttributes instanceof Array || Array.isArray(feedAttributes)) {
		for (const feedAttribute of asArray(feedAttributes)) {
			if (feedAttribute.rel == "alternate") {
				return feedAttribute.href;
			}
		}
		return null;
	}
	if (feedAttributes != null && feedAttributes.rel == "alternate") {
		return feedAttributes.href;
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
	const xml = await sendRequest(feedUrl);
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

function entryAlternateUrl(entry) {
	const entryAttributes = entry.link$attrs;
	if (entryAttributes instanceof Array || Array.isArray(entryAttributes)) {
		for (const entryAttribute of asArray(entryAttributes)) {
			if (entryAttribute.rel == "alternate") {
				return entryAttribute.href;
			}
		}
		return null;
	}
	if (entryAttributes != null && entryAttributes.rel == "alternate") {
		return entryAttributes.href;
	}
	return null;
}

function entryVideoId(entry) {
	if (entry["yt:videoId"] != null) {
		return entry["yt:videoId"];
	}
	if (typeof entry.id === "string" && entry.id.indexOf("yt:video:") === 0) {
		return entry.id.slice("yt:video:".length);
	}
	const url = entryAlternateUrl(entry);
	if (url != null) {
		const match = url.match(/[?&]v=([A-Za-z0-9_-]+)/);
		if (match) {
			return match[1];
		}
	}
	return null;
}

function countVideoIdsInXml(xml) {
	const matches = xml.match(/<yt:videoId>/g);
	return matches == null ? 0 : matches.length;
}

function entriesFromParsedFeed(jsonObject) {
	if (jsonObject.feed == null || jsonObject.feed.entry == null) {
		return [];
	}
	return asArray(jsonObject.feed.entry);
}

// Fallback when xmlParse collapses repeated <entry> nodes to a single object.
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
		const titleMatch = block.match(/<media:title>([\s\S]*?)<\/media:title>/) || block.match(/<title>([\s\S]*?)<\/title>/);
		const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
		const descriptionMatch = block.match(/<media:description>([\s\S]*?)<\/media:description>/);
		const thumbMatch = block.match(/<media:thumbnail\b[^>]*\burl="([^"]+)"/);
		const widthMatch = block.match(/<media:thumbnail\b[^>]*\bwidth="([^"]+)"/);
		const heightMatch = block.match(/<media:thumbnail\b[^>]*\bheight="([^"]+)"/);
		const authorNameMatch = block.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/);
		const authorUriMatch = block.match(/<author>[\s\S]*?<uri>([\s\S]*?)<\/uri>/);
		const linkMatch = block.match(/<link\b[^>]*\brel="alternate"[^>]*\bhref="([^"]+)"/) ||
			block.match(/<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="alternate"/);

		entries.push({
			"yt:videoId": videoIdMatch[1],
			id: "yt:video:" + videoIdMatch[1],
			title: decodeXmlEntities(titleMatch ? titleMatch[1] : videoIdMatch[1]),
			published: publishedMatch ? publishedMatch[1] : null,
			link$attrs: {rel: "alternate", href: linkMatch ? linkMatch[1] : ("https://www.youtube.com/watch?v=" + videoIdMatch[1])},
			author: {
				name: decodeXmlEntities(authorNameMatch ? authorNameMatch[1] : null),
				uri: authorUriMatch ? authorUriMatch[1] : null
			},
			"media:group": {
				"media:title": decodeXmlEntities(titleMatch ? titleMatch[1] : videoIdMatch[1]),
				"media:description": decodeXmlEntities(descriptionMatch ? descriptionMatch[1] : null),
				"media:thumbnail$attrs": thumbMatch ? {
					url: thumbMatch[1],
					width: widthMatch ? widthMatch[1] : null,
					height: heightMatch ? heightMatch[1] : null
				} : null
			}
		});
	}
	return entries;
}

function resolveEntries(xml, jsonObject) {
	const parsed = entriesFromParsedFeed(jsonObject);
	const xmlCount = countVideoIdsInXml(xml);
	if (xmlCount > parsed.length) {
		const fallback = entriesFromAtomXml(xml);
		if (fallback.length > parsed.length) {
			return fallback;
		}
	}
	return parsed;
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

function formatDescription(rawDescription) {
	if (rawDescription == null || rawDescription.length === 0) {
		return null;
	}

	const mode = (typeof descriptionLength !== "undefined" && descriptionLength != null)
		? descriptionLength
		: ((typeof includeDescription !== "undefined" && includeDescription == "off") ? "Off" : "Short");

	if (mode == "Off" || mode == "off") {
		return null;
	}

	let text = String(rawDescription);
	if (mode == "Short" || mode == "short") {
		// Prefer the first paragraph when it's already concise.
		const firstParagraph = text.split(/\n\n+/)[0] || text;
		text = truncatePlainText(firstParagraph, SHORT_DESCRIPTION_CHARS);
		const linked = text.replace(urlRegex, "<a href=\"$1\">$1</a>");
		return `<p>${linked}</p>`;
	}

	// Full
	const linkedDescription = text.replace(urlRegex, "<a href=\"$1\">$1</a>");
	const paragraphs = linkedDescription.split("\n\n");
	return paragraphs.map((paragraph) => {
		const lines = paragraph.split("\n");
		const breakLines = lines.join("<br/>");
		return `<p>${breakLines}</p>`;
	}).join("\n");
}

function embedHost() {
	// Privacy-Enhanced Mode reduces third-party cookies / personalization.
	// It is not ad-free; YouTube may still show ads inside the player.
	return privacyEnhanced != "off"
		? "https://www.youtube-nocookie.com"
		: "https://www.youtube.com";
}

function buildEmbedHtml(videoId) {
	// playsinline=1 keeps iOS WKWebView from handing off to the YouTube app.
	// rel=0 / modestbranding=1 / iv_load_policy=3 trim chrome and related noise.
	const params = [
		"playsinline=1",
		"rel=0",
		"modestbranding=1",
		"iv_load_policy=3",
		"fs=1"
	].join("&");
	const src = `${embedHost()}/embed/${videoId}?${params}`;
	return `<div class="tapestry-youtube-embed"><iframe id="player-${videoId}" type="text/html" width="640" height="390" src="${src}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen playsinline></iframe></div>`;
}

function buildAttachments(videoId, title, thumbnailUrl, thumbnailWidth, thumbnailHeight) {
	const attachments = [];

	// Timeline hero only — avoid a second link-preview card that repeats the title
	// and points at youtube-nocookie.com (detail playback uses the body iframe).
	if (thumbnailUrl != null) {
		const media = MediaAttachment.createWithUrl(thumbnailUrl);
		media.mimeType = "image/jpeg";
		media.text = title;
		if (thumbnailWidth != null && thumbnailHeight != null) {
			media.aspectSize = {width: thumbnailWidth, height: thumbnailHeight};
		}
		attachments.push(media);
	}

	return attachments;
}

function buildItemFromEntry(entry) {
	const videoId = entryVideoId(entry);
	if (videoId == null) {
		return null;
	}

	const url = entryAlternateUrl(entry) ?? `https://www.youtube.com/watch?v=${videoId}`;
	const published = entry.published;
	const date = published != null ? new Date(published) : new Date();
	if (isNaN(date.getTime())) {
		return null;
	}

	const mediaGroup = entry["media:group"];
	const title = decodeXmlEntities(mediaGroup != null ? mediaGroup["media:title"] : entry.title) || videoId;

	let thumbnailUrl = null;
	let thumbnailWidth = null;
	let thumbnailHeight = null;
	const thumbAttrs = mediaGroup != null ? mediaGroup["media:thumbnail$attrs"] : null;
	if (thumbAttrs != null && thumbAttrs.url != null) {
		thumbnailUrl = thumbAttrs.url;
		if (thumbAttrs.width != null) {
			thumbnailWidth = Number(thumbAttrs.width);
		}
		if (thumbAttrs.height != null) {
			thumbnailHeight = Number(thumbAttrs.height);
		}
	}
	if (thumbnailUrl == null) {
		thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
		thumbnailWidth = 480;
		thumbnailHeight = 360;
	}

	const rawDescription = mediaGroup != null ? mediaGroup["media:description"] : null;
	const description = formatDescription(rawDescription);
	const embed = buildEmbedHtml(videoId);

	const resultItem = Item.createWithUriDate(url, date);
	resultItem.title = title;
	resultItem.body = description != null ? embed + description : embed;
	resultItem.author = createFeedIdentity();
	resultItem.attachments = buildAttachments(
		videoId,
		title,
		thumbnailUrl,
		thumbnailWidth,
		thumbnailHeight
	);
	return resultItem;
}

async function load() {
	const feedUrl = await getFeedUrl();
	const xml = await sendRequest(feedUrl);
	const jsonObject = await xmlParse(xml);
	const allEntries = resolveEntries(xml, jsonObject);

	allEntries.sort((a, b) => {
		const aDate = new Date(a.published || 0).getTime();
		const bDate = new Date(b.published || 0).getTime();
		return bDate - aDate;
	});

	const results = [];
	const seen = {};
	for (const entry of allEntries) {
		try {
			const videoId = entryVideoId(entry);
			if (videoId == null) {
				continue;
			}
			const url = entryAlternateUrl(entry) ?? `https://www.youtube.com/watch?v=${videoId}`;
			if (seen[url] == true) {
				continue;
			}

			const resultItem = buildItemFromEntry(entry);
			if (resultItem == null) {
				continue;
			}
			seen[url] = true;
			results.push(resultItem);
		}
		catch (e) {
			// Skip malformed entries; still return the rest of the playlist.
			continue;
		}
	}

	processResults(results);
}
