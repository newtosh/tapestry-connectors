// com.producthunt.feed
//
// Product Hunt topic Atom feed with optional GraphQL media enrichment.
// Never scrapes product HTML pages.

const PRODUCTHUNT_ICON = loadIconUrl();
const PRODUCTHUNT_BASE_URL = "https://www.producthunt.com";
const PRODUCTHUNT_GRAPHQL = "https://api.producthunt.com/v2/api/graphql";
// Conservative cap: lean post(id) media lookups share the app's 6250/15min complexity budget.
// This stays a GLOBAL cap across all merged topics, not per-topic — adding topics must never
// scale GraphQL cost.
const MAX_ENRICH_IDS = 12;
// PH's feed endpoint has no native multi-topic param (space/comma-joined slugs silently fall
// back to an unfiltered default feed instead of erroring) — so multi-topic is fetched as N
// separate Atom requests and merged client-side. Cap topic count to bound that fan-out.
const MAX_TOPICS = 5;
const MAX_MERGED_ENTRIES = 50;

const userAgent = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3";

function loadIconUrl() {
	const iconUrl = require("icon-url.txt");
	if (iconUrl === false) {
		throw new Error("Missing resources/icon-url.txt — run: make build");
	}
	return iconUrl;
}

function createFeedIdentity() {
	const identity = Identity.createWithName("Product Hunt");
	identity.uri = PRODUCTHUNT_BASE_URL;
	identity.avatar = PRODUCTHUNT_ICON;
	return identity;
}

function topicSlugs() {
	let raw = "";
	if (typeof topic !== "undefined" && topic != null) {
		raw = String(topic).trim();
	}
	if (raw.length === 0) {
		return ["tech"];
	}

	const seen = {};
	const slugs = [];
	for (const piece of raw.split(/[,\s]+/)) {
		const slug = piece.trim();
		if (slug.length === 0) {
			continue;
		}
		const key = slug.toLowerCase();
		if (seen[key]) {
			continue;
		}
		seen[key] = true;
		slugs.push(slug);
		if (slugs.length >= MAX_TOPICS) {
			break;
		}
	}
	return slugs.length > 0 ? slugs : ["tech"];
}

function feedUrlForTopicSlug(slug) {
	return PRODUCTHUNT_BASE_URL + "/feed?category=" + encodeURIComponent(slug);
}

function developerTokenValue() {
	if (typeof developerToken === "undefined" || developerToken == null) {
		return "";
	}
	return String(developerToken).trim();
}

function showTopicsEnabled() {
	return typeof showTopics !== "undefined" && showTopics == "on";
}

async function verify() {
	processVerification({
		displayName: "Product Hunt",
		icon: PRODUCTHUNT_ICON,
		baseUrl: PRODUCTHUNT_BASE_URL,
		accountIdentity: createFeedIdentity()
	});
}

async function fetchTopicEntries(slug, useConditional) {
	const feedUrl = feedUrlForTopicSlug(slug);
	let response = null;
	if (useConditional) {
		response = await sendConditionalRequest(feedUrl, "GET", null, {"user-agent": userAgent});
	}
	if (response == null || response.length === 0) {
		response = await sendRequest(feedUrl, "GET", null, {"user-agent": userAgent});
	}
	if (response == null || response.length === 0) {
		return [];
	}

	const xmlText = String(response);
	let entries = entriesFromAtomXml(xmlText);

	try {
		const jsonObject = await xmlParse(xmlText);
		const parsed = entriesFromParsedFeed(jsonObject);
		if (parsed.length > entries.length) {
			entries = parsed;
		}
	} catch (e) {
		// Raw Atom parse is enough.
	}

	for (const entry of entries) {
		entry.sourceTopic = slug;
	}
	return entries;
}

function mergeEntries(entryLists) {
	const seen = {};
	const merged = [];
	for (const list of entryLists) {
		for (const entry of list) {
			const key = entry.postId != null ? "id:" + entry.postId : "url:" + entry.link;
			if (key == null) {
				continue;
			}
			const existing = seen[key];
			if (existing != null) {
				if (existing.topics.indexOf(entry.sourceTopic) < 0) {
					existing.topics.push(entry.sourceTopic);
				}
				continue;
			}
			entry.topics = [entry.sourceTopic];
			seen[key] = entry;
			merged.push(entry);
		}
	}
	merged.sort((a, b) => {
		const aTime = a.published != null ? new Date(a.published).getTime() : 0;
		const bTime = b.published != null ? new Date(b.published).getTime() : 0;
		return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
	});
	return merged.slice(0, MAX_MERGED_ENTRIES);
}

async function load() {
	const slugs = topicSlugs();
	const useConditional = slugs.length === 1;

	const entryLists = [];
	for (const slug of slugs) {
		entryLists.push(await fetchTopicEntries(slug, useConditional));
	}
	const entries = mergeEntries(entryLists);

	if (entries.length === 0) {
		processResults([]);
		return;
	}

	const results = [];
	const enrichTargets = [];

	for (const entry of entries) {
		const title = entry.title;
		const url = entry.link;
		if (url == null || url.length === 0) {
			continue;
		}

		const date = entry.published != null ? new Date(entry.published) : new Date();
		if (isNaN(date.getTime())) {
			continue;
		}

		let body = buildEntryBody(entry);
		if (showTopicsEnabled() && entry.topics != null && entry.topics.length > 0) {
			const topicsLine = "<p><em>Topics: " + escapeHtml(entry.topics.join(", ")) + "</em></p>";
			body = body != null && body.length > 0 ? (body + "\n" + topicsLine) : topicsLine;
		}
		const resultItem = Item.createWithUriDate(url, date);
		if (title != null && title.length > 0) {
			resultItem.title = title;
		}
		if (body != null && body.length > 0) {
			resultItem.body = body;
		}
		resultItem.author = createFeedIdentity();

		const postId = entry.postId;
		results.push({item: resultItem, postId: postId, body: body});
		if (postId != null) {
			enrichTargets.push({index: results.length - 1, postId: postId});
		}
	}

	const token = developerTokenValue();
	if (token.length > 0 && enrichTargets.length > 0) {
		try {
			await enrichResults(results, enrichTargets, token);
		} catch (e) {
			// Feed-first: enrichment must never blank the timeline.
		}
	}

	const items = [];
	for (const row of results) {
		items.push(row.item);
	}
	processResults(items);
}

async function enrichResults(results, enrichTargets, token) {
	const capped = enrichTargets.slice(0, MAX_ENRICH_IDS);
	const enrichment = await fetchPostsByIds(capped.map((t) => t.postId), token);
	if (enrichment == null) {
		return;
	}

	for (let i = 0; i < capped.length; i++) {
		const target = capped[i];
		const post = enrichment[target.postId];
		if (post == null) {
			continue;
		}

		const row = results[target.index];
		// Prefer the actual product screenshots (post.media) over the mismatched
		// thumbnail crop — mixing a small logo thumb with real screenshots is
		// what produced the cramped strip. Same-source screenshots stack cleanly.
		const shots = post.galleryUrls.length > 0 ? post.galleryUrls : [httpsUrl(post.thumbnailUrl)].filter((u) => u != null);
		const attachments = shots.map((url) => MediaAttachment.createWithUrl(url));
		if (attachments.length > 0) {
			row.item.attachments = attachments;
		}

		const meta = formatStretchMeta(post.votesCount, post.dailyRank);
		if (meta != null) {
			const existing = row.item.body != null ? String(row.item.body) : (row.body || "");
			row.item.body = existing.length > 0 ? (meta + "\n" + existing) : meta;
		}
	}
}

async function fetchPostsByIds(postIds, token) {
	if (postIds.length === 0) {
		return {};
	}

	const aliases = [];
	const variables = {};
	const varDecls = [];
	for (let i = 0; i < postIds.length; i++) {
		const id = postIds[i];
		const varName = "id" + i;
		varDecls.push("$" + varName + ": ID!");
		aliases.push("p" + i + ": post(id: $" + varName + ") { id name votesCount dailyRank thumbnail { url } media { url type } }");
		variables[varName] = id;
	}

	const query = "query EnrichPosts(" + varDecls.join(", ") + ") {\n" + aliases.join("\n") + "\n}";
	const headers = {
		"Authorization": "Bearer " + token,
		"Content-Type": "application/json",
		"Accept": "application/json"
	};
	const body = JSON.stringify({query: query, variables: variables});

	let response;
	try {
		response = await sendRequest(PRODUCTHUNT_GRAPHQL, "POST", body, headers, true);
	} catch (e) {
		return null;
	}

	const parsed = parseFullResponse(response);
	if (parsed == null) {
		return null;
	}
	if (parsed.status === 429) {
		return null;
	}
	if (parsed.status != null && parsed.status >= 400) {
		return null;
	}

	let json;
	try {
		json = JSON.parse(parsed.body);
	} catch (e) {
		return null;
	}

	if (json == null || json.data == null) {
		return null;
	}

	const byId = {};
	for (let i = 0; i < postIds.length; i++) {
		const node = json.data["p" + i];
		if (node == null) {
			continue;
		}
		const id = normalizePostId(node.id) || postIds[i];
		byId[id] = {
			thumbnailUrl: node.thumbnail != null ? node.thumbnail.url : null,
			galleryUrls: galleryUrlsFromMedia(node.media),
			votesCount: node.votesCount,
			dailyRank: node.dailyRank
		};
	}
	return byId;
}

function parseFullResponse(response) {
	if (response == null) {
		return null;
	}
	// Tapestry fullResponse resolves to a JSON string envelope:
	// { status, headers, url, body }.
	if (typeof response === "string") {
		try {
			const envelope = JSON.parse(response);
			if (envelope != null && typeof envelope === "object" && envelope.body != null) {
				return {
					status: envelope.status != null ? Number(envelope.status) : 200,
					headers: envelope.headers || {},
					body: String(envelope.body)
				};
			}
		} catch (e) {
			// Fall through: treat as raw GraphQL body (non-fullResponse path).
		}
		return {status: 200, headers: {}, body: response};
	}
	if (typeof response === "object") {
		const status = response.status != null ? Number(response.status) : 200;
		const body = response.body != null ? String(response.body) : "";
		return {status: status, headers: response.headers || {}, body: body};
	}
	return null;
}

// Tapestry renders 2+ attachments as a tiled mosaic (confirmed empirically;
// item_style has no effect). Cap at 1 to guarantee a full-width hero image.
const MAX_GALLERY_IMAGES = 1;

function galleryUrlsFromMedia(media) {
	if (media == null) {
		return [];
	}
	const list = media instanceof Array ? media : [media];
	const urls = [];
	for (const item of list) {
		if (urls.length >= MAX_GALLERY_IMAGES) {
			break;
		}
		if (item == null || item.url == null) {
			continue;
		}
		const type = item.type != null ? String(item.type).toLowerCase() : "";
		if (type.indexOf("video") >= 0) {
			continue;
		}
		const url = httpsUrl(item.url);
		if (url != null) {
			urls.push(url);
		}
	}
	return urls;
}

function httpsUrl(value) {
	if (value == null) {
		return null;
	}
	const url = String(value).trim();
	if (url.indexOf("https://") === 0) {
		return url;
	}
	return null;
}

function formatStretchMeta(votesCount, dailyRank) {
	const parts = [];
	if (votesCount != null && !isNaN(Number(votesCount))) {
		parts.push(String(votesCount) + " votes");
	}
	if (dailyRank != null && !isNaN(Number(dailyRank))) {
		parts.push("#" + String(dailyRank) + " today");
	}
	if (parts.length === 0) {
		return null;
	}
	return "<p><em>" + parts.join(" · ") + "</em></p>";
}

function buildEntryBody(entry) {
	const chunks = [];
	if (entry.tagline != null && entry.tagline.length > 0) {
		chunks.push("<p>" + escapeHtml(entry.tagline) + "</p>");
	}
	if (entry.authorName != null && entry.authorName.length > 0) {
		chunks.push("<p>by " + escapeHtml(entry.authorName) + "</p>");
	}

	const links = [];
	if (entry.discussionUrl != null) {
		links.push('<a href="' + escapeAttr(entry.discussionUrl) + '">Discussion</a>');
	}
	if (entry.productLink != null) {
		links.push('<a href="' + escapeAttr(entry.productLink) + '">Link</a>');
	} else if (entry.link != null) {
		links.push('<a href="' + escapeAttr(entry.link) + '">Product</a>');
	}
	if (links.length > 0) {
		chunks.push("<p>" + links.join(" | ") + "</p>");
	} else if (entry.contentHtml != null && entry.contentHtml.length > 0) {
		chunks.push(entry.contentHtml);
	}

	return chunks.length > 0 ? chunks.join("\n") : null;
}

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeAttr(value) {
	return escapeHtml(value).replace(/'/g, "&#39;");
}

function entriesFromAtomXml(xmlText) {
	const entries = [];
	const entryRegex = /<entry\b[\s\S]*?<\/entry>/gi;
	let match;
	while ((match = entryRegex.exec(xmlText)) != null) {
		const block = match[0];
		const title = firstTagText(block, "title");
		const published = firstTagText(block, "published") || firstTagText(block, "updated");
		const idText = firstTagText(block, "id");
		const link = alternateHref(block) || productLinkFromContent(block);
		const contentHtml = decodeHtmlEntities(cdataOrInner(block, "content") || "");
		const authorName = authorNameFromEntryXml(block);
		const tagline = taglineFromContentHtml(contentHtml);
		const discussionUrl = hrefMatching(contentHtml, /\/products\//i) || link;
		const productLink = hrefMatching(contentHtml, /\/r\/p\//i);
		const postId = postIdFromAtomId(idText) || postIdFromRpPath(contentHtml) || postIdFromRpPath(block);

		entries.push({
			title: title,
			published: published,
			link: link,
			contentHtml: contentHtml,
			authorName: authorName,
			tagline: tagline,
			discussionUrl: discussionUrl,
			productLink: productLink,
			postId: postId
		});
	}
	return entries;
}

function entriesFromParsedFeed(jsonObject) {
	if (jsonObject == null || jsonObject.feed == null || jsonObject.feed.entry == null) {
		return [];
	}
	const raw = jsonObject.feed.entry;
	const list = raw instanceof Array ? raw : [raw];
	const entries = [];
	for (const entry of list) {
		const title = extractString(entry.title);
		const published = extractString(entry.published) || extractString(entry.updated);
		const idText = extractString(entry.id);
		let link = null;
		if (entry["link$attrs"] != null && entry["link$attrs"].href != null) {
			link = String(entry["link$attrs"].href);
		} else if (entry.link != null) {
			if (typeof entry.link === "string") {
				link = entry.link;
			} else if (entry.link instanceof Array) {
				for (const l of entry.link) {
					if (l != null && l["link$attrs"] != null && l["link$attrs"].rel === "alternate") {
						link = l["link$attrs"].href;
						break;
					}
				}
				if (link == null && entry.link[0] != null && entry.link[0]["link$attrs"] != null) {
					link = entry.link[0]["link$attrs"].href;
				}
			}
		}
		const contentHtml = extractString(entry.content, true) || extractString(entry.summary, true) || "";
		const authorName = extractAuthorName(entry.author);
		const tagline = taglineFromContentHtml(contentHtml);
		const discussionUrl = hrefMatching(contentHtml, /\/products\//i) || link;
		const productLink = hrefMatching(contentHtml, /\/r\/p\//i);
		const postId = postIdFromAtomId(idText) || postIdFromRpPath(contentHtml);

		entries.push({
			title: title,
			published: published,
			link: link,
			contentHtml: contentHtml,
			authorName: authorName,
			tagline: tagline,
			discussionUrl: discussionUrl,
			productLink: productLink,
			postId: postId
		});
	}
	return entries;
}

function extractAuthorName(author) {
	if (author == null) {
		return null;
	}
	if (typeof author === "string") {
		return author.trim();
	}
	if (author.name != null) {
		return extractString(author.name);
	}
	return extractString(author);
}

function authorNameFromEntryXml(block) {
	const authorBlock = block.match(/<author\b[\s\S]*?<\/author>/i);
	if (authorBlock == null) {
		return null;
	}
	return firstTagText(authorBlock[0], "name");
}

function taglineFromContentHtml(html) {
	if (html == null || html.length === 0) {
		return null;
	}
	const match = html.match(/<p[^>]*>\s*([\s\S]*?)\s*<\/p>/i);
	if (match == null) {
		return null;
	}
	const text = stripTags(match[1]).trim();
	if (text.length === 0 || /^discussion$/i.test(text) || /^link$/i.test(text)) {
		return null;
	}
	return text;
}

function postIdFromAtomId(idText) {
	if (idText == null) {
		return null;
	}
	const match = String(idText).match(/Post\/(\d+)\s*$/i);
	if (match == null) {
		return null;
	}
	return normalizePostId(match[1]);
}

function postIdFromRpPath(text) {
	if (text == null) {
		return null;
	}
	const match = String(text).match(/\/r\/p\/(\d+)/);
	if (match == null) {
		return null;
	}
	return normalizePostId(match[1]);
}

function normalizePostId(value) {
	if (value == null) {
		return null;
	}
	const id = String(value).trim();
	if (!/^\d+$/.test(id)) {
		return null;
	}
	return id;
}

function firstTagText(xml, tag) {
	const re = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i");
	const match = xml.match(re);
	if (match == null) {
		return null;
	}
	return decodeHtmlEntities(stripTags(match[1])).trim();
}

function cdataOrInner(xml, tag) {
	const re = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i");
	const match = xml.match(re);
	if (match == null) {
		return null;
	}
	let inner = match[1].trim();
	const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
	if (cdata != null) {
		return cdata[1];
	}
	return inner;
}

function alternateHref(entryXml) {
	const links = entryXml.match(/<link\b[^>]*>/gi) || [];
	for (const link of links) {
		if (/rel=["']alternate["']/i.test(link) || !/rel=/i.test(link)) {
			const href = link.match(/href=["']([^"']+)["']/i);
			if (href != null) {
				return href[1];
			}
		}
	}
	return null;
}

function productLinkFromContent(entryXml) {
	return hrefMatching(entryXml, /\/products\//i);
}

function hrefMatching(html, pattern) {
	if (html == null) {
		return null;
	}
	const re = /href=["']([^"']+)["']/gi;
	let match;
	while ((match = re.exec(html)) != null) {
		const href = decodeHtmlEntities(match[1]);
		if (pattern.test(href)) {
			return href;
		}
	}
	return null;
}

function stripTags(value) {
	return String(value).replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(value) {
	return String(value)
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'");
}

function extractString(node, allowHTML = false) {
	if (node == null) {
		return null;
	}
	if (typeof node === "string") {
		return node.trim();
	}
	if (typeof node === "object") {
		if (node["#text"] != null) {
			return String(node["#text"]).trim();
		}
		if (node["p"] != null) {
			const paragraphs = node["p"] instanceof Array ? node["p"] : [node["p"]];
			let value = "";
			for (const child of paragraphs) {
				const string = extractString(child, allowHTML);
				if (string == null) {
					continue;
				}
				if (allowHTML) {
					value += "<p>" + string + "</p>\n";
				} else {
					value += string;
				}
			}
			return value.trim();
		}
		if (node["a"] != null) {
			return extractString(node["a"], allowHTML);
		}
	}
	return null;
}
