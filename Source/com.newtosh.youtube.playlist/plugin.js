// com.newtosh.youtube.playlist
//
// Community YouTube playlist (and channel) feeds with in-app embed playback.
// Modeled on TheIconfactory com.youtube, with playlist Atom feed support.

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
	if (uri != null && String(uri).length > 0) {
		identity.uri = uri;
	}
	identity.avatar = getItem("channelAvatar") || CONNECTOR_ICON;
	return identity;
}

function normalizeYouTubeUrl(input) {
	let url = String(input).trim();

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
	const listMatch = String(url).match(/[?&]list=([A-Za-z0-9_-]+)/);
	if (listMatch) {
		return listMatch[1];
	}
	const feedMatch = String(url).match(/playlist_id=([A-Za-z0-9_-]+)/);
	if (feedMatch) {
		return feedMatch[1];
	}
	return null;
}

function rememberPlaylistId(url) {
	const playlistId = extractPlaylistId(url);
	if (playlistId != null) {
		setItem("playlistId", playlistId);
	}
	return playlistId;
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
	if (cached != null && String(cached).length > 0) {
		rememberPlaylistId(cached);
		return cached;
	}

	const url = normalizeYouTubeUrl(site);

	if (url.includes("/feeds/videos.xml")) {
		rememberPlaylistId(url);
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
	if (feedAttributes instanceof Array) {
		for (const feedAttribute of feedAttributes) {
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
	const imageSrc = String(html).match(avatarRegex);
	if (imageSrc) {
		return imageSrc[1];
	}
	const ogImage = String(html).match(ogImageRegex);
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

function countVideoIds(xml) {
	const matches = String(xml).match(/<yt:videoId>/g);
	return matches == null ? 0 : matches.length;
}

// indexOf parser — avoids JSCore global-regex edge cases on large Atom payloads.
function entriesFromAtomXml(xml) {
	const source = String(xml);
	const entries = [];
	let cursor = 0;

	while (true) {
		const start = source.indexOf("<entry>", cursor);
		if (start < 0) {
			break;
		}
		const end = source.indexOf("</entry>", start);
		if (end < 0) {
			break;
		}
		const block = source.substring(start + 7, end);
		cursor = end + 8;

		const videoIdMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
		if (videoIdMatch == null) {
			continue;
		}

		const videoId = videoIdMatch[1];
		const titleMatch = block.match(/<media:title>([\s\S]*?)<\/media:title>/) || block.match(/<title>([\s\S]*?)<\/title>/);
		const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
		const updatedMatch = block.match(/<updated>([^<]+)<\/updated>/);
		const descriptionMatch = block.match(/<media:description>([\s\S]*?)<\/media:description>/);
		const thumbMatch = block.match(/<media:thumbnail\b[^>]*\burl="([^"]+)"/);

		entries.push({
			videoId: videoId,
			title: decodeXmlEntities(titleMatch ? titleMatch[1] : videoId),
			published: publishedMatch ? publishedMatch[1] : (updatedMatch ? updatedMatch[1] : null),
			description: decodeXmlEntities(descriptionMatch ? descriptionMatch[1] : null),
			thumbnailUrl: thumbMatch ? thumbMatch[1] : ("https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg")
		});
	}

	return entries;
}

function entriesFromParsedFeed(jsonObject) {
	if (jsonObject == null || jsonObject.feed == null || jsonObject.feed.entry == null) {
		return [];
	}
	const entry = jsonObject.feed.entry;
	const list = (entry instanceof Array) ? entry : [entry];
	const entries = [];
	for (const item of list) {
		const videoId = item["yt:videoId"];
		if (videoId == null) {
			continue;
		}
		const mediaGroup = item["media:group"];
		const thumbAttrs = mediaGroup != null ? mediaGroup["media:thumbnail$attrs"] : null;
		entries.push({
			videoId: videoId,
			title: mediaGroup != null ? mediaGroup["media:title"] : item.title,
			published: item.published || item.updated || null,
			description: mediaGroup != null ? mediaGroup["media:description"] : null,
			thumbnailUrl: (thumbAttrs != null && thumbAttrs.url != null)
				? thumbAttrs.url
				: ("https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg")
		});
	}
	return entries;
}

function itemUriForVideo(videoId, index) {
	const playlistId = getItem("playlistId");
	if (playlistId != null && String(playlistId).length > 0) {
		// Unique per playlist membership so items are not collapsed against the
		// built-in YouTube Channel connector's watch?v= URIs.
		return "https://www.youtube.com/watch?v=" + videoId + "&list=" + playlistId + "&index=" + String(index + 1);
	}
	return "https://www.youtube.com/watch?v=" + videoId;
}

function descriptionMode() {
	if (typeof descriptionLength !== "undefined" && descriptionLength != null && String(descriptionLength).length > 0) {
		return String(descriptionLength).trim();
	}
	return "Short";
}

function formatDescription(rawDescription) {
	if (rawDescription == null || String(rawDescription).length === 0) {
		return null;
	}

	const mode = descriptionMode();
	if (mode == "Off" || mode == "off") {
		return null;
	}

	let text = String(rawDescription);
	if (mode != "Full" && mode != "full") {
		const firstParagraph = text.split(/\n\n+/)[0] || text;
		const normalized = firstParagraph.replace(/\s+/g, " ").trim();
		if (normalized.length > SHORT_DESCRIPTION_CHARS) {
			const slice = normalized.slice(0, SHORT_DESCRIPTION_CHARS);
			const lastSpace = slice.lastIndexOf(" ");
			const clipped = lastSpace > 80 ? slice.slice(0, lastSpace) : slice;
			text = clipped.replace(/[.,;:!?-]*$/, "") + "…";
		}
		else {
			text = normalized;
		}
		return "<p>" + text.replace(urlRegex, "<a href=\"$1\">$1</a>") + "</p>";
	}

	const linkedDescription = text.replace(urlRegex, "<a href=\"$1\">$1</a>");
	const paragraphs = linkedDescription.split("\n\n");
	return paragraphs.map((paragraph) => {
		const lines = paragraph.split("\n");
		return "<p>" + lines.join("<br/>") + "</p>";
	}).join("\n");
}

function embedHost() {
	return (typeof privacyEnhanced !== "undefined" && privacyEnhanced == "off")
		? "https://www.youtube.com"
		: "https://www.youtube-nocookie.com";
}

function buildEmbedHtml(videoId) {
	const src = embedHost() + "/embed/" + videoId + "?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&fs=1";
	return "<iframe id=\"player-" + videoId + "\" type=\"text/html\" width=\"640\" height=\"390\" src=\"" + src + "\" title=\"YouTube video player\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\" referrerpolicy=\"strict-origin-when-cross-origin\" allowfullscreen playsinline></iframe>";
}

async function load() {
	const feedUrl = await getFeedUrl();
	rememberPlaylistId(feedUrl);

	// Match stock com.youtube: plain sendRequest (no custom headers) for the Atom feed.
	const xml = await sendRequest(feedUrl);
	const xmlText = String(xml);
	const xmlIdCount = countVideoIds(xmlText);

	let entries = entriesFromAtomXml(xmlText);

	// Also try xmlParse; keep whichever yields more entries.
	try {
		const jsonObject = await xmlParse(xmlText);
		const parsed = entriesFromParsedFeed(jsonObject);
		if (parsed.length > entries.length) {
			entries = parsed;
		}
	}
	catch (e) {
		// Raw Atom parse is enough.
	}

	entries.sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));

	var results = [];
	const seen = {};
	for (var i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const videoId = entry.videoId;
		if (videoId == null || seen[videoId] == true) {
			continue;
		}
		seen[videoId] = true;

		const date = entry.published != null ? new Date(entry.published) : new Date();
		if (isNaN(date.getTime())) {
			continue;
		}

		const title = entry.title || videoId;
		const uri = itemUriForVideo(videoId, results.length);
		const description = formatDescription(entry.description);
		const embed = buildEmbedHtml(videoId);

		const resultItem = Item.createWithUriDate(uri, date);
		resultItem.title = title;
		resultItem.body = description != null ? (embed + description) : embed;
		resultItem.author = createFeedIdentity();

		// Thumbnail for the timeline; detail view uses the iframe embed.
		const media = MediaAttachment.createWithUrl(entry.thumbnailUrl || ("https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"));
		media.mimeType = "image/jpeg";
		media.text = title;
		resultItem.attachments = [media];

		results.push(resultItem);
	}

	if (results.length == 0 && xmlIdCount > 0) {
		processError(Error("Found " + xmlIdCount + " videos in the playlist feed but could not build timeline items."));
		return;
	}

	processResults(results);
}
