// com.newtosh.youtube.playlist
//
// Community YouTube playlist (and channel) feeds with in-app embed playback.
// Separate from the built-in com.youtube connector: playlist Atom feeds are
// supported here; stock com.youtube rejects them.

const avatarRegex = /<link rel="image_src" href="([^"]*)">/;
const urlRegex = /(https?:[^\s]*)/g;
const defaultIcon = "https://www.youtube.com/s/desktop/905763c7/img/favicon_144x144.png";
const extraHeaders = {"user-agent": "WhatsApp/2"}; // avoid EU cookie nonsense

function loadIconUrl() {
	const iconUrl = require("icon-url.txt");
	if (iconUrl === false) {
		return defaultIcon;
	}
	return iconUrl;
}

const CONNECTOR_ICON = loadIconUrl();

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

	const identity = Identity.createWithName(authorName);
	identity.uri = authorUri ?? baseUrl;
	identity.avatar = CONNECTOR_ICON;

	const finish = (icon) => {
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
		const match = html.match(avatarRegex);
		finish(match ? match[1] : CONNECTOR_ICON);
	})
	.catch((requestError) => {
		finish(CONNECTOR_ICON);
		processError(requestError);
	});
}

function entriesFromFeed(jsonObject) {
	if (jsonObject.feed == null || jsonObject.feed.entry == null) {
		return [];
	}
	const entry = jsonObject.feed.entry;
	return entry instanceof Array ? entry : [entry];
}

function entryAlternateUrl(entry) {
	const entryAttributes = entry.link$attrs;
	if (entryAttributes instanceof Array) {
		for (const entryAttribute of entryAttributes) {
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

function formatDescription(rawDescription) {
	const linkedDescription = rawDescription.replace(urlRegex, "<a href=\"$1\">$1</a>");
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

function buildAttachments(videoId, title, authorName, thumbnailUrl, thumbnailWidth, thumbnailHeight) {
	const attachments = [];

	if (thumbnailUrl != null) {
		const media = MediaAttachment.createWithUrl(thumbnailUrl);
		media.mimeType = "image/jpeg";
		media.text = title;
		if (thumbnailWidth != null && thumbnailHeight != null) {
			media.aspectSize = {width: thumbnailWidth, height: thumbnailHeight};
		}
		attachments.push(media);
	}

	// Prefer the privacy-enhanced watch-equivalent embed page for the card URL so
	// opening the attachment stays in Tapestry’s detail/WebKit path when possible.
	const linkUrl = `${embedHost()}/embed/${videoId}?playsinline=1`;
	const link = LinkAttachment.createWithUrl(linkUrl);
	link.type = "video.other";
	link.title = title;
	link.siteName = "YouTube";
	if (authorName != null) {
		link.authorName = authorName;
	}
	if (thumbnailUrl != null) {
		link.image = thumbnailUrl;
	}
	attachments.push(link);

	return attachments;
}

async function load() {
	const feedUrl = await getFeedUrl();
	const xml = await sendRequest(feedUrl);
	const jsonObject = await xmlParse(xml);
	const allEntries = entriesFromFeed(jsonObject);

	allEntries.sort((a, b) => new Date(b.published) - new Date(a.published));

	const results = [];
	for (const entry of allEntries) {
		const videoId = entry["yt:videoId"];
		if (videoId == null) {
			continue;
		}

		const url = entryAlternateUrl(entry) ?? `https://www.youtube.com/watch?v=${videoId}`;
		const date = new Date(entry.published);
		const mediaGroup = entry["media:group"];
		const title = mediaGroup != null ? mediaGroup["media:title"] : entry.title;
		const authorName = entry.author != null ? entry.author.name : null;

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

		let description = null;
		if (includeDescription == "on" && mediaGroup != null && mediaGroup["media:description"] != null) {
			description = formatDescription(mediaGroup["media:description"]);
		}

		const embed = buildEmbedHtml(videoId);
		const resultItem = Item.createWithUriDate(url, date);
		resultItem.title = title;
		resultItem.body = description != null ? embed + description : embed;

		if (authorName != null) {
			const identity = Identity.createWithName(authorName);
			if (entry.author != null && entry.author.uri != null) {
				identity.uri = entry.author.uri;
			}
			resultItem.author = identity;
		}

		resultItem.attachments = buildAttachments(
			videoId,
			title,
			authorName,
			thumbnailUrl,
			thumbnailWidth,
			thumbnailHeight
		);

		results.push(resultItem);
	}

	processResults(results);
}
