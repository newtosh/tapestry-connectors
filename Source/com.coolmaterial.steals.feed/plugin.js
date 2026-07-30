// com.coolmaterial.steals.feed
//
// Cool Material connector: editorial posts + steals deals.

const COOL_MATERIAL_ICON = loadIconUrl();
const COOL_MATERIAL_BASE_URL = "https://coolmaterial.com";
const COOL_MATERIAL_STEALS_FEED = "https://coolmaterial.com/steals/feed/";

const userAgent = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3";
const ARTICLE_FETCH_USER_AGENTS = [
	userAgent,
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
];

const SKIP_CATEGORIES = new Set([
	"Features",
	"Partner",
	"Shopping",
	"What We're Buying",
	"Lifestyle",
	"Fashion",
	"Gear",
	"Accessories",
	"Clothing",
	"Travel",
	"Drinks",
	"Food",
	"Outdoors",
	"Sports",
	"Tech",
	"Guides"
]);

function loadIconUrl() {
	const iconUrl = require("icon-url.txt");
	if (iconUrl === false) {
		throw new Error("Missing resources/icon-url.txt — run: make build");
	}
	return iconUrl;
}

function createFeedIdentity() {
	const identity = Identity.createWithName("Cool Material");
	identity.uri = COOL_MATERIAL_BASE_URL;
	identity.avatar = COOL_MATERIAL_ICON;
	return identity;
}

async function verify() {
	const response = await sendRequest(site, "GET", null, {"user-agent": userAgent});
	const jsonObject = await xmlParse(response);

	if (jsonObject.rss != null && jsonObject.rss.channel != null) {
		processVerification({
			displayName: "Cool Material",
			icon: COOL_MATERIAL_ICON,
			baseUrl: COOL_MATERIAL_BASE_URL,
			accountIdentity: createFeedIdentity()
		});
	}
}

async function load() {
	let editorialResponse = await sendConditionalRequest(site, "GET", null, {"user-agent": userAgent});
	if (editorialResponse == null || editorialResponse.length === 0) {
		editorialResponse = await sendRequest(site, "GET", null, {"user-agent": userAgent});
	}
	const stealsResponse = await sendRequest(COOL_MATERIAL_STEALS_FEED, "GET", null, {"user-agent": userAgent});

	const feedItems = [];
	if (editorialResponse != null && editorialResponse.length > 0) {
		feedItems.push(...await extractFeedItems(editorialResponse));
	}
	if (stealsResponse != null && stealsResponse.length > 0) {
		feedItems.push(...await extractFeedItems(stealsResponse));
	}

	if (feedItems.length === 0) {
		processResults([]);
		return;
	}

	feedItems.sort((left, right) => right.date.getTime() - left.date.getTime());

	const results = [];
	const seenUris = new Set();

	for (const item of feedItems) {
		if (isStealItem(item.rssItem)) {
			const resultItem = buildStealItem(item);
			if (resultItem == null || seenUris.has(resultItem.uri)) {
				continue;
			}
			seenUris.add(resultItem.uri);
			results.push(resultItem);
			continue;
		}

		const resultItem = await buildEditorialItem(item);
		if (resultItem == null || seenUris.has(resultItem.uri)) {
			continue;
		}
		seenUris.add(resultItem.uri);
		results.push(resultItem);
	}

	processResults(results);
}

async function extractFeedItems(response) {
	const jsonObject = await xmlParse(response);
	if (jsonObject.rss == null || jsonObject.rss.channel == null || jsonObject.rss.channel.item == null) {
		return [];
	}

	const item = jsonObject.rss.channel.item;
	const items = item instanceof Array ? item : [item];
	const feedItems = [];

	for (const rssItem of items) {
		let itemDate = rssItem["pubDate"] ?? rssItem["dc:date"] ?? rssItem["a10:updated"];
		if (itemDate?.endsWith(" Z")) {
			itemDate = itemDate.slice(0, -2) + "GMT";
		}
		const date = itemDate == null ? new Date() : new Date(itemDate);
		feedItems.push({rssItem, date});
	}

	return feedItems;
}

function isStealItem(item) {
	const guid = decodeHtmlEntities(feedValueToString(item.guid));
	if (guid.includes("post_type=steals")) {
		return true;
	}

	const link = decodeHtmlEntities(extractItemLink(item) ?? feedValueToString(item.link));
	if (link.includes("post_type=steals") || link.includes("/steals/")) {
		return true;
	}

	const descriptionHtml = feedValueToString(item.description, true);
	if (descriptionHtml.includes("cm-steal-image") || descriptionHtml.includes("cm-steal-price")) {
		return true;
	}

	const hasStealMedia = item["media:thumbnail$attrs"] != null || item["enclosure$attrs"] != null;
	if (hasStealMedia && isAffiliateLink(link)) {
		return true;
	}

	return isAffiliateLink(link);
}

function isAffiliateLink(url) {
	return url.length > 0 && !url.includes("coolmaterial.com");
}

function isEditorialArticleUrl(url) {
	return /^https:\/\/coolmaterial\.com\/(feature|partner|gear|lifestyle|tech|fashion|watches|drinks|food|travel|outdoors|guides|steal-roundups|misc|shopping)\//i.test(url);
}

function buildStealItem(feedItem) {
	const item = feedItem.rssItem;
	const url = extractStealUri(item);
	if (url == null) {
		return null;
	}

	const title = extractString(item.title);
	const descriptionHtml = feedValueToString(item.description, true);
	const steal = descriptionHtml != null ? parseStealDescription(descriptionHtml) : null;

	let content = null;
	if (steal?.label != null && steal.label.length > 0) {
		content = `<p>${escapeHtml(steal.label)}</p>`;
	}
	if (steal?.href != null && steal.purchaseLabel != null) {
		content = appendPurchaseLinksToContent(content, [{
			href: steal.href,
			label: steal.purchaseLabel
		}]);
	}

	let authorName = formatAuthorName(item["dc:creator"]);
	if (authorName != null && authorName.length > 0 && authorName !== "Cool Material") {
		content = prependByline(content, authorName);
	}

	const resultItem = Item.createWithUriDate(url, feedItem.date);
	if (title != null) {
		resultItem.title = title;
	}
	if (content != null && content.length > 0) {
		resultItem.body = content;
	}
	resultItem.author = createFeedIdentity();
	resultItem.annotations = [Annotation.createWithText("Steals")];

	const attachments = [];
	let heroImageUrl = attachmentUrlFromMedia(item["media:thumbnail$attrs"]);
	if (heroImageUrl == null) {
		heroImageUrl = attachmentUrlFromMedia(item["media:content$attrs"]);
	}
	if (heroImageUrl == null && steal?.imageUrl != null) {
		heroImageUrl = steal.imageUrl;
	}
	if (heroImageUrl == null && item["enclosure$attrs"]?.url != null) {
		heroImageUrl = item["enclosure$attrs"].url;
	}
	if (heroImageUrl != null) {
		attachments.push(MediaAttachment.createWithUrl(heroImageUrl));
	}
	if (attachments.length > 0) {
		resultItem.attachments = attachments;
	}

	return resultItem;
}

async function buildEditorialItem(feedItem) {
	const item = feedItem.rssItem;
	if (isStealItem(item)) {
		return buildStealItem(feedItem);
	}

	const url = extractEditorialUri(item);
	if (url == null || isAffiliateLink(url)) {
		return null;
	}

	const title = extractString(item.title);
	let content = null;
	let heroImageUrl = attachmentUrlFromMedia(item["media:thumbnail$attrs"]);
	if (heroImageUrl == null) {
		heroImageUrl = attachmentUrlFromMedia(item["media:content$attrs"]);
	}

	const enrichment = await enrichFromArticlePage(url, title, feedItem.date);
	if (enrichment != null) {
		if (enrichment.bodyHtml != null && enrichment.bodyHtml.length > 0) {
			content = enrichment.bodyHtml;
		} else if (enrichment.summary != null && enrichment.summary.length > 0) {
			content = `<p>${escapeHtml(enrichment.summary.trim())}</p>`;
		}
		if (heroImageUrl == null && enrichment.imageUrl != null) {
			heroImageUrl = enrichment.imageUrl;
		}
		if (enrichment.purchaseLinks != null && enrichment.purchaseLinks.length > 0) {
			content = appendPurchaseLinksToContent(content, enrichment.purchaseLinks);
		}
	}

	let authorName = formatAuthorName(item["dc:creator"]);
	if (authorName != null && authorName.length > 0 && authorName !== "Cool Material") {
		content = prependByline(content, authorName);
	}

	const resultItem = Item.createWithUriDate(url, feedItem.date);
	if (title != null) {
		resultItem.title = title;
	}
	if (content != null && content.length > 0) {
		resultItem.body = content;
	}
	resultItem.author = createFeedIdentity();

	const category = pickEditorialCategory(item.category);
	if (category != null) {
		resultItem.annotations = [Annotation.createWithText(category)];
	}

	const attachments = [];
	if (heroImageUrl == null && item["enclosure$attrs"]?.url != null) {
		heroImageUrl = item["enclosure$attrs"].url;
	}
	if (heroImageUrl != null) {
		attachments.push(MediaAttachment.createWithUrl(heroImageUrl));
	}
	if (attachments.length > 0) {
		resultItem.attachments = attachments;
	}

	return resultItem;
}

async function enrichFromArticlePage(url, title, articleDate) {
	if (!isEditorialArticleUrl(url)) {
		return null;
	}

	let summary = null;
	let bodyHtml = null;
	let imageUrl = null;
	let purchaseLinks = null;

	const html = await fetchArticleHtml(url);
	if (html != null) {
		summary = extractArticleSummary(html);
		bodyHtml = extractArticleBodyHtml(html);
		imageUrl = extractFeaturedImageUrl(html);
		purchaseLinks = extractPurchaseLinkEntries(html);
	}

	if ((summary == null || summary.length === 0) && bodyHtml == null) {
		const searchSnippet = await fetchSearchSnippetForUrl(url);
		if (searchSnippet != null && searchSnippet.length > 0) {
			summary = searchSnippet;
		}
	}

	if (imageUrl == null) {
		imageUrl = await fetchSearchImageForUrl(url, title, articleDate);
	}

	if (summary == null && bodyHtml == null && imageUrl == null && purchaseLinks == null) {
		return null;
	}

	return {summary, bodyHtml, imageUrl, purchaseLinks};
}

async function fetchArticleHtml(url) {
	const requestHeaders = {
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9"
	};

	for (const articleUserAgent of ARTICLE_FETCH_USER_AGENTS) {
		try {
			const html = await sendRequest(url, "GET", null, {
				"user-agent": articleUserAgent,
				"Accept": requestHeaders["Accept"],
				"Accept-Language": requestHeaders["Accept-Language"]
			});
			if (html != null && html.length > 0 && !isCloudflareChallenge(html)) {
				return html;
			}
		} catch (error) {
			continue;
		}
	}

	return null;
}

async function fetchSearchSnippetForUrl(url) {
	try {
		const urlPath = extractCoolMaterialPath(url);
		if (urlPath == null) {
			return null;
		}

		const searchQuery = `site:coolmaterial.com${urlPath}`;
		const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
		const html = await sendRequest(searchUrl, "GET", null, {
			"user-agent": userAgent,
			"Accept": "text/html"
		});
		if (html == null || html.length === 0) {
			return null;
		}

		return extractSearchSnippetForPath(html, urlPath);
	} catch (error) {
		return null;
	}
}

function extractCoolMaterialPath(url) {
	const match = url.match(/^https:\/\/coolmaterial\.com(\/[^?#]*)/i);
	return match != null ? match[1] : null;
}

function extractSearchSnippetForPath(html, urlPath) {
	const normalizedPath = urlPath.replace(/\/$/, "");
	const blocks = html.split("result__body");
	for (const block of blocks) {
		if (!block.includes(normalizedPath)) {
			continue;
		}

		const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
		if (snippetMatch == null) {
			continue;
		}

		const text = cleanSearchSnippet(snippetMatch[1]);
		if (text.length > 0) {
			return text;
		}
	}

	return null;
}

function cleanSearchSnippet(snippetHtml) {
	return decodeHtmlEntities(
		snippetHtml
			.replace(/<\/?b>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim()
	).replace(/^\|\s*/, "");
}

async function fetchSearchImageForUrl(url, title, articleDate) {
	const urlPath = extractCoolMaterialPath(url);
	if (urlPath == null) {
		return null;
	}

	const slugQuery = slugKeywordsFromPath(urlPath);
	const searchQueries = [`site:coolmaterial.com${urlPath}`];
	if (slugQuery != null && slugQuery.length > 0) {
		searchQueries.push(`site:coolmaterial.com ${slugQuery}`);
	}
	if (title != null && title.length > 0) {
		searchQueries.push(`site:coolmaterial.com "${title}"`);
	}

	const searchUrls = [];
	for (const searchQuery of searchQueries) {
		searchUrls.push(`https://search.brave.com/images?q=${encodeURIComponent(searchQuery)}`);
		searchUrls.push(`https://www.bing.com/images/search?q=${encodeURIComponent(searchQuery)}`);
	}

	const searchUserAgents = ["Mozilla/5.0", userAgent, ARTICLE_FETCH_USER_AGENTS[1]];

	for (const searchUrl of searchUrls) {
		for (const searchUserAgent of searchUserAgents) {
			try {
				const html = await sendRequest(searchUrl, "GET", null, {
					"user-agent": searchUserAgent,
					"Accept": "text/html"
				});
				if (html == null || html.length === 0 || isRateLimitedSearchResponse(html)) {
					continue;
				}

				const imageUrl = pickSearchImageUrl(html, urlPath, title, articleDate);
				if (imageUrl != null) {
					return imageUrl;
				}
			} catch (error) {
				continue;
			}
		}
	}

	return null;
}

function slugKeywordsFromPath(urlPath) {
	const slug = urlPath.replace(/^\/(?:partner|feature)\//i, "").replace(/\/$/, "");
	if (slug.length === 0) {
		return null;
	}
	return slug.replace(/-/g, " ").trim();
}

function isRateLimitedSearchResponse(html) {
	return html.includes("Too Many Requests") || html.includes("429 Too Many Requests");
}

function pickSearchImageUrl(html, urlPath, title, articleDate) {
	const normalizedPath = urlPath.replace(/\/$/, "").toLowerCase();
	const bingPairs = extractBingImagePairs(html);
	for (const pair of bingPairs) {
		if (!pair.purl.toLowerCase().includes(normalizedPath)) {
			continue;
		}
		const imageUrl = normalizeWordPressImageUrl(pair.murl);
		if (!isPlaceholderImage(imageUrl) && hasImageExtension(imageUrl)) {
			return imageUrl;
		}
	}

	const candidates = extractCoolMaterialUploadUrls(html);
	return rankSearchImageCandidates(candidates, urlPath, title, articleDate);
}

function extractBingImagePairs(html) {
	const pairs = [];
	const pairRegex = /&quot;purl&quot;:&quot;([^&]*)&quot;,&quot;murl&quot;:&quot;([^&]*)&quot;/gi;
	let pairMatch = pairRegex.exec(html);
	while (pairMatch != null) {
		pairs.push({
			purl: decodeHtmlEntities(pairMatch[1]),
			murl: decodeHtmlEntities(pairMatch[2])
		});
		pairMatch = pairRegex.exec(html);
	}
	return pairs;
}

function extractCoolMaterialUploadUrls(html) {
	const candidates = [];
	const imageRegex = /https:\/\/coolmaterial\.com\/wp-content\/uploads\/[^"\\&\s<>]+/gi;
	let imageMatch = imageRegex.exec(html);
	while (imageMatch != null) {
		candidates.push(normalizeWordPressImageUrl(imageMatch[0]));
		imageMatch = imageRegex.exec(html);
	}

	const bingMurlRegex = /&quot;murl&quot;:&quot;(https:\/\/coolmaterial\.com\/wp-content\/uploads\/[^&]+)&quot;/gi;
	let bingMatch = bingMurlRegex.exec(html);
	while (bingMatch != null) {
		candidates.push(normalizeWordPressImageUrl(decodeHtmlEntities(bingMatch[1])));
		bingMatch = bingMurlRegex.exec(html);
	}

	return candidates;
}

function rankSearchImageCandidates(candidates, urlPath, title, articleDate) {
	const slugQuery = slugKeywordsFromPath(urlPath);
	const slugTokens = slugQuery != null ? slugQuery.split(/\s+/).filter((token) => token.length > 2) : [];
	const titleTokens = title != null
		? title.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)
		: [];
	const uploadPathPrefix = articleUploadPathPrefix(articleDate);

	let bestUrl = null;
	let bestScore = -1;
	const seen = new Set();

	for (const candidate of candidates) {
		if (seen.has(candidate)) {
			continue;
		}
		seen.add(candidate);
		if (isPlaceholderImage(candidate) || !hasImageExtension(candidate)) {
			continue;
		}

		const lowerCandidate = candidate.toLowerCase();
		let score = 0;
		if (uploadPathPrefix != null && lowerCandidate.includes(uploadPathPrefix)) {
			score += 12;
		}
		for (const token of slugTokens) {
			if (lowerCandidate.includes(token)) {
				score += 3;
			}
		}
		for (const token of titleTokens) {
			if (lowerCandidate.includes(token)) {
				score += 1;
			}
		}

		const dimensionMatch = candidate.match(/-(\d+)x(\d+)(\.(?:jpe?g|png|webp|avif|gif))$/i);
		if (dimensionMatch != null) {
			score += Math.min(parseInt(dimensionMatch[1], 10), 2000) / 1000;
		}

		if (score > bestScore) {
			bestScore = score;
			bestUrl = candidate;
		}
	}

	if (bestUrl != null && bestScore > 0) {
		return bestUrl;
	}

	for (const candidate of candidates) {
		if (!isPlaceholderImage(candidate) && hasImageExtension(candidate)) {
			return candidate;
		}
	}

	return null;
}

function articleUploadPathPrefix(articleDate) {
	if (articleDate == null) {
		return null;
	}

	const date = articleDate instanceof Date ? articleDate : new Date(articleDate);
	if (isNaN(date.getTime())) {
		return null;
	}

	const year = date.getUTCFullYear();
	const month = date.getUTCMonth() + 1;
	const monthString = month < 10 ? `0${month}` : `${month}`;
	return `/uploads/${year}/${monthString}/`;
}

function normalizeWordPressImageUrl(imageUrl) {
	const decoded = decodeHtmlEntities(imageUrl);
	return decoded.replace(/-(\d+)x(\d+)(\.(?:jpe?g|png|webp|avif|gif))$/i, "$3");
}

function isCloudflareChallenge(html) {
	return html.includes("Just a moment") && html.includes("cloudflare");
}

function extractArticleSummary(html) {
	const jsonLdSummary = extractJsonLdArticleField(html, "description");
	if (jsonLdSummary != null && jsonLdSummary.length > 0) {
		return jsonLdSummary;
	}

	const dekPatterns = [
		/class="[^"]*shortform-article__dek[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
		/class="[^"]*article__dek[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i,
		/class="[^"]*c-dek[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i
	];

	for (const pattern of dekPatterns) {
		const dekMatch = html.match(pattern);
		if (dekMatch != null) {
			const text = decodeHtmlEntities(dekMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
			if (text.length > 0) {
				return text;
			}
		}
	}

	return extractMetaContent(html, "og:description")
		?? extractMetaContent(html, "twitter:description")
		?? extractMetaName(html, "description");
}

function extractArticleBodyHtml(html) {
	const contentMatch = html.match(/<div[^>]*class="[^"]*c-shortform-article__content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
	if (contentMatch == null) {
		return null;
	}

	let scope = contentMatch[1];
	scope = scope.replace(/<div[^>]*class="[^"]*c-product-lists__card[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "");
	scope = scope.replace(/<style[\s\S]*?<\/style>/gi, "");
	scope = scope.replace(/<script[\s\S]*?<\/script>/gi, "");

	const paragraphs = [];
	const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
	let paragraphMatch = paragraphRegex.exec(scope);
	while (paragraphMatch != null) {
		const text = decodeHtmlEntities(paragraphMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
		if (text.length > 30 && !isBoilerplateParagraph(text)) {
			paragraphs.push(`<p>${escapeHtml(text)}</p>`);
		}
		if (paragraphs.length >= 3) {
			break;
		}
		paragraphMatch = paragraphRegex.exec(scope);
	}

	return paragraphs.length > 0 ? paragraphs.join("") : null;
}

function isBoilerplateParagraph(text) {
	return /^(share article|subscribe|get the cool material newsletter|insider recommendations)/i.test(text);
}

function extractJsonLdArticleField(html, fieldName) {
	for (const node of extractJsonLdNodes(html)) {
		const nodeType = node["@type"];
		const types = nodeType instanceof Array ? nodeType : [nodeType];
		if (!types.some((type) => type === "Article" || type === "NewsArticle" || type === "WebPage" || type === "BlogPosting")) {
			continue;
		}

		const value = node[fieldName];
		if (typeof(value) === "string" && value.trim().length > 0) {
			return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
		}
	}

	return null;
}

function extractJsonLdImageUrl(html) {
	for (const node of extractJsonLdNodes(html)) {
		const image = node.image;
		const imageUrl = normalizeImageReference(image);
		if (imageUrl != null) {
			return imageUrl;
		}
	}

	return null;
}

function extractJsonLdNodes(html) {
	const nodes = [];
	const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
	let jsonLdMatch = jsonLdRegex.exec(html);
	while (jsonLdMatch != null) {
		try {
			const data = JSON.parse(jsonLdMatch[1]);
			if (data instanceof Array) {
				nodes.push(...data);
			} else if (data?.["@graph"] instanceof Array) {
				nodes.push(...data["@graph"]);
			} else if (data != null && typeof(data) === "object") {
				nodes.push(data);
			}
		} catch (error) {
			// Ignore malformed JSON-LD blocks.
		}
		jsonLdMatch = jsonLdRegex.exec(html);
	}

	return nodes;
}

function normalizeImageReference(image) {
	if (image == null) {
		return null;
	}
	if (typeof(image) === "string") {
		return normalizeImageUrl(image);
	}
	if (image instanceof Array) {
		for (const entry of image) {
			const imageUrl = normalizeImageReference(entry);
			if (imageUrl != null) {
				return imageUrl;
			}
		}
		return null;
	}
	if (typeof(image) === "object") {
		return normalizeImageReference(image.url ?? image["@id"] ?? image.contentUrl);
	}

	return null;
}

function normalizeImageUrl(imageUrl) {
	if (imageUrl == null || imageUrl.length === 0 || isPlaceholderImage(imageUrl)) {
		return null;
	}
	return imageUrl.startsWith("http") ? imageUrl : `https:${imageUrl}`;
}

function extractFeaturedImageUrl(html) {
	const jsonLdImage = extractJsonLdImageUrl(html);
	if (jsonLdImage != null) {
		return jsonLdImage;
	}

	const metaImage = extractMetaImageUrl(html);
	if (metaImage != null && !isPlaceholderImage(metaImage)) {
		return metaImage;
	}

	const patterns = [
		/<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i,
		/<img[^>]*src="([^"]+)"[^>]*class="[^"]*wp-post-image[^"]*"/i,
		/<div[^>]*class="[^"]*c-article-header[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i,
		/<figure[^>]*class="[^"]*wp-block-image[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i,
		/<img[^>]*class="[^"]*c-article-header[^"]*"[^>]*src="([^"]+)"/i,
		/<img[^>]*srcset="([^"]+)"[^>]*class="[^"]*wp-post-image[^"]*"/i
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match != null) {
			const imageUrl = pickLargestSrcsetUrl(match[1]);
			if (imageUrl != null && !isPlaceholderImage(imageUrl)) {
				return normalizeImageUrl(imageUrl);
			}
		}
	}

	const uploadsMatch = html.match(/https:\/\/coolmaterial\.com\/wp-content\/uploads\/[^"'\\s]+/i);
	if (uploadsMatch != null) {
		return normalizeImageUrl(uploadsMatch[0]);
	}

	return metaImage != null && !isPlaceholderImage(metaImage) ? metaImage : null;
}

function pickLargestSrcsetUrl(srcOrSrcset) {
	if (srcOrSrcset == null || srcOrSrcset.length === 0) {
		return null;
	}
	if (!srcOrSrcset.includes(",")) {
		return decodeHtmlEntities(srcOrSrcset.trim());
	}

	let bestUrl = null;
	let bestWidth = 0;
	for (const candidate of srcOrSrcset.split(",")) {
		const parts = candidate.trim().split(/\s+/);
		if (parts.length === 0 || parts[0].length === 0) {
			continue;
		}
		const width = parts.length > 1 ? Number.parseInt(parts[1], 10) : 0;
		if (width >= bestWidth) {
			bestWidth = width;
			bestUrl = parts[0];
		}
	}

	return bestUrl != null ? decodeHtmlEntities(bestUrl) : decodeHtmlEntities(srcOrSrcset.split(",")[0].trim());
}

function isPlaceholderImage(url) {
	return /Funny-Meme-Square|placeholder|1x1|pixel\.gif/i.test(url);
}

function hasImageExtension(url) {
	return /\.(?:jpe?g|png|webp|avif|gif)(?:\?|$)/i.test(url);
}

function extractPurchaseLinkEntries(html) {
	const scopes = [];
	const shortformMatch = html.match(/<div[^>]*class="[^"]*c-shortform-article__content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
	if (shortformMatch != null) {
		scopes.push(shortformMatch[1]);
	}

	const productListRegex = /<div[^>]*class="[^"]*c-product-lists__card[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi;
	let productListMatch = productListRegex.exec(html);
	while (productListMatch != null) {
		scopes.push(productListMatch[0]);
		productListMatch = productListRegex.exec(html);
	}

	if (scopes.length === 0) {
		return null;
	}

	const linksByDestination = new Map();

	for (const scope of scopes) {
		const anchorRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
		let anchorMatch = anchorRegex.exec(scope);
		while (anchorMatch != null) {
			const anchorHtml = anchorMatch[0];
			if (!isPurchaseAnchor(anchorHtml, scope)) {
				anchorMatch = anchorRegex.exec(scope);
				continue;
			}

			const href = decodeHtmlEntities(anchorMatch[1]);
			const label = decodeHtmlEntities(anchorMatch[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
			if (label.length === 0 || isInternalCoolMaterialLink(href) || isJunkPurchaseLabel(label)) {
				anchorMatch = anchorRegex.exec(scope);
				continue;
			}

			const destination = normalizePurchaseHref(href);
			const existing = linksByDestination.get(destination);
			if (existing == null) {
				linksByDestination.set(destination, {href, labels: [label]});
			} else {
				existing.labels.push(label);
			}

			anchorMatch = anchorRegex.exec(scope);
		}
	}

	const entries = [];
	for (const {href, labels} of linksByDestination.values()) {
		const label = labels.length === 1 ? labels[0] : labels.join(" · ");
		entries.push({href, label});
	}

	return entries.length > 0 ? entries : null;
}

function isJunkPurchaseLabel(label) {
	if (/^shop all/i.test(label)) {
		return true;
	}
	if (/^buy tires\b/i.test(label)) {
		return true;
	}
	if (/\bprescriptions?\b/i.test(label) && !/\$\d/.test(label)) {
		return true;
	}
	if (/gift cards?/i.test(label)) {
		return true;
	}
	if (/walmart business/i.test(label)) {
		return true;
	}
	if (/^shop\b/i.test(label) && label.length < 16 && !/\$\d/.test(label)) {
		return true;
	}
	if (/^buy\b/i.test(label) && label.length < 20 && !/\$\d/.test(label)) {
		return true;
	}
	return false;
}

function isPurchaseAnchor(anchorHtml, scopeHtml) {
	if (/product-url-style/i.test(anchorHtml)) {
		return true;
	}
	if (/content__cta/i.test(anchorHtml)) {
		return true;
	}
	if (/c-product-lists__card/i.test(scopeHtml)) {
		return true;
	}

	return false;
}

function isInternalCoolMaterialLink(href) {
	return href.includes("coolmaterial.com/") && !href.includes("/steals/");
}

function normalizePurchaseHref(href) {
	const skimMatch = href.match(/[?&]url=([^&]+)/i);
	if (skimMatch != null) {
		try {
			return decodeURIComponent(skimMatch[1]);
		} catch {
			return skimMatch[1];
		}
	}
	return href;
}

function pickEditorialCategory(category) {
	const categories = normalizeCategories(category);
	for (const value of categories) {
		if (!SKIP_CATEGORIES.has(value)) {
			return value;
		}
	}
	for (const value of categories) {
		if (value !== "Features" && value !== "Partner") {
			return value;
		}
	}
	return categories.length > 0 ? categories[0] : null;
}

function normalizeCategories(category) {
	if (category == null) {
		return [];
	}
	if (category instanceof Array) {
		return category.map((value) => String(value).trim()).filter((value) => value.length > 0);
	}
	const text = String(category).trim();
	return text.length > 0 ? [text] : [];
}

function extractStealUri(item) {
	const guid = feedValueToString(item.guid);
	if (guid.length > 0) {
		return decodeHtmlEntities(guid);
	}
	return decodeHtmlEntities(feedValueToString(item.link));
}

function extractEditorialUri(item) {
	const link = extractItemLink(item);
	if (link != null) {
		return link;
	}
	const guid = feedValueToString(item.guid);
	return guid.length > 0 ? decodeHtmlEntities(guid) : null;
}

function extractItemLink(item) {
	if (item.link == null) {
		return null;
	}
	if (typeof(item.link) === "string") {
		const link = item.link.trim();
		return link.length > 0 ? decodeHtmlEntities(link) : null;
	}
	const link = feedValueToString(item.link);
	return link.length > 0 ? decodeHtmlEntities(link) : null;
}

function feedValueToString(value, allowHTML = false) {
	if (value == null) {
		return "";
	}
	if (typeof(value) === "string") {
		return value.trim();
	}
	return extractString(value, allowHTML) ?? "";
}

function formatAuthorName(authorName) {
	if (authorName == null) {
		return null;
	}
	if (authorName instanceof Array) {
		return authorName.join(", ");
	}
	return String(authorName).trim();
}

function parseStealDescription(html) {
	const imageBlockMatch = html.match(/<p class="cm-steal-image">([\s\S]*?)<\/p>/i);
	const priceBlockMatch = html.match(/<p class="cm-steal-price">([\s\S]*?)<\/p>/i);

	let href = null;
	let imageUrl = null;
	if (imageBlockMatch != null) {
		const block = imageBlockMatch[1];
		const hrefMatch = block.match(/href="([^"]+)"/i);
		if (hrefMatch != null) {
			href = decodeHtmlEntities(hrefMatch[1]);
		}
		const imageMatch = block.match(/src="([^"]+)"/i);
		if (imageMatch != null) {
			imageUrl = decodeHtmlEntities(imageMatch[1]);
		}
	}

	const priceLabel = priceBlockMatch != null
		? formatStealPriceLabel(priceBlockMatch[1])
		: formatStealPriceLabel(html);

	if (href == null) {
		const hrefMatch = html.match(/href="([^"]+)"/i);
		if (hrefMatch != null) {
			href = decodeHtmlEntities(hrefMatch[1]);
		}
	}

	return {
		href,
		imageUrl,
		label: priceLabel,
		purchaseLabel: priceLabel != null ? `Shop · ${priceLabel}` : "Shop"
	};
}

function formatStealPriceLabel(priceHtml) {
	const saleMatch = priceHtml.match(/<strong>([^<]+)<\/strong>/i);
	const listMatch = priceHtml.match(/<del>([^<]+)<\/del>/i);
	const salePrice = saleMatch != null
		? decodeHtmlEntities(saleMatch[1].replace(/\s+/g, " ").trim())
		: null;
	const listPrice = listMatch != null
		? decodeHtmlEntities(listMatch[1].replace(/\s+/g, " ").trim())
		: null;

	if (salePrice != null && listPrice != null) {
		return `${salePrice} (was ${listPrice})`;
	}
	if (salePrice != null) {
		return salePrice;
	}
	if (listPrice != null) {
		return listPrice;
	}

	const plainText = decodeHtmlEntities(priceHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
	return plainText.length > 0 ? plainText : null;
}

function appendPurchaseLinksToContent(content, linkEntries) {
	const inlineLinks = linkEntries.map(({href, label}) =>
		`<a href="${href}">${escapeHtml(label)}</a>`
	).join("<br>");

	if (content != null && content.length > 0) {
		if (content.endsWith("</p>")) {
			return `${content.slice(0, -4)}<br><br>${inlineLinks}</p>`;
		}
		return `<p>${escapeHtml(content)}<br><br>${inlineLinks}</p>`;
	}

	return `<p class="purchase-link">${inlineLinks}</p>`;
}

function extractMetaContent(html, property) {
	const match = html.match(new RegExp(`<meta[^>]*property="${property}"[^>]*content="([^"]+)"`, "i"))
		?? html.match(new RegExp(`<meta[^>]*content="([^"]+)"[^>]*property="${property}"`, "i"));
	return match != null ? decodeHtmlEntities(match[1]) : null;
}

function extractMetaName(html, name) {
	const match = html.match(new RegExp(`<meta[^>]*name="${name}"[^>]*content="([^"]+)"`, "i"))
		?? html.match(new RegExp(`<meta[^>]*content="([^"]+)"[^>]*name="${name}"`, "i"));
	return match != null ? decodeHtmlEntities(match[1]) : null;
}

function extractMetaImageUrl(html) {
	const imageUrl = extractMetaContent(html, "og:image:secure_url")
		?? extractMetaContent(html, "og:image:url")
		?? extractMetaContent(html, "og:image");
	if (imageUrl == null) {
		return null;
	}
	return imageUrl.startsWith("http") ? imageUrl : `https:${imageUrl}`;
}

function attachmentUrlFromMedia(mediaAttributes) {
	if (mediaAttributes?.url != null) {
		return mediaAttributes.url;
	}
	return null;
}

function prependByline(content, authorName) {
	const byline = `<p>by ${escapeHtml(authorName)}</p>`;
	if (content == null || content.length === 0) {
		return byline;
	}
	return `${byline}\n${content}`;
}

function escapeHtml(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function decodeHtmlEntities(text) {
	return text
		.replace(/&nbsp;/g, "\u00A0")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function extractString(node, allowHTML = false) {
	if (node != null) {
		if (typeof(node) == "string") {
			return node.trim();
		} else if (typeof(node) == "object") {
			if (node["p"] != null) {
				if (node["p"] instanceof Array) {
					let value = "";
					for (const childNode of node["p"]) {
						const string = extractString(childNode, allowHTML);
						if (allowHTML) {
							value += `<p>${string}</p>\n`;
						} else {
							value += string;
						}
					}
					return value;
				} else {
					const string = extractString(node["p"], allowHTML);
					if (allowHTML) {
						return `<p>${string}</p>\n`;
					} else {
						return string;
					}
				}
			} else if (node["a"] != null) {
				if (node["a"] instanceof Array) {
					let value = "";
					for (const childNode of node["a"]) {
						const string = extractString(childNode, allowHTML);
						if (allowHTML && node["a$attrs"]?.href != null) {
							value += `<a href="${node["a$attrs"].href}">${string}</a>`;
						} else {
							value += string;
						}
					}
					return value;
				} else {
					const string = extractString(node["a"], allowHTML);
					if (allowHTML && node["a$attrs"]?.href != null) {
						return `<a href="${node["a$attrs"].href}">${string}</a>`;
					} else {
						return string;
					}
				}
			}
		}
	}

	return null;
}
