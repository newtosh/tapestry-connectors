// com.coolmaterial.steals.feed
//
// Cool Material connector: editorial posts + steals deals.

const COOL_MATERIAL_ICON = loadIconUrl();
const COOL_MATERIAL_BASE_URL = "https://coolmaterial.com";
const COOL_MATERIAL_STEALS_FEED = "https://coolmaterial.com/steals/feed/";

const userAgent = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3";

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

function createFeedIdentity(authorName = null) {
	const identity = Identity.createWithName("Cool Material");
	identity.uri = COOL_MATERIAL_BASE_URL;
	identity.avatar = COOL_MATERIAL_ICON;
	if (authorName != null && authorName.length > 0 && authorName !== "Cool Material") {
		identity.username = `by ${authorName}`;
	}
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
	const editorialResponse = await sendConditionalRequest(site, "GET", null, {"user-agent": userAgent});
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
		if (isStealItem(item)) {
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

	const link = decodeHtmlEntities(feedValueToString(item.link));
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
	return /^https:\/\/coolmaterial\.com\/(feature|partner|gear|lifestyle|tech|fashion|watches|drinks|food|travel|outdoors|guides|steal-roundups)\//i.test(url);
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
	const resultItem = Item.createWithUriDate(url, feedItem.date);
	if (title != null) {
		resultItem.title = title;
	}
	if (content != null && content.length > 0) {
		resultItem.body = content;
	}
	resultItem.author = createFeedIdentity(authorName);
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
	if (url == null || !isEditorialArticleUrl(url)) {
		return null;
	}

	const title = extractString(item.title);
	let content = null;
	let heroImageUrl = attachmentUrlFromMedia(item["media:thumbnail$attrs"]);
	if (heroImageUrl == null) {
		heroImageUrl = attachmentUrlFromMedia(item["media:content$attrs"]);
	}

	const enrichment = await enrichFromArticlePage(url);
	if (enrichment != null) {
		if (enrichment.summary != null && enrichment.summary.length > 0) {
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
	const resultItem = Item.createWithUriDate(url, feedItem.date);
	if (title != null) {
		resultItem.title = title;
	}
	if (content != null && content.length > 0) {
		resultItem.body = content;
	}
	resultItem.author = createFeedIdentity(authorName);

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

async function enrichFromArticlePage(url) {
	if (!isEditorialArticleUrl(url)) {
		return null;
	}

	try {
		const html = await sendRequest(url, "GET", null, {"user-agent": userAgent});
		if (html == null || html.length === 0 || isCloudflareChallenge(html)) {
			return null;
		}

		const summary = extractArticleSummary(html);
		const imageUrl = extractFeaturedImageUrl(html);
		const purchaseLinks = extractPurchaseLinkEntries(html);

		if (summary == null && imageUrl == null && purchaseLinks == null) {
			return null;
		}

		return {summary, imageUrl, purchaseLinks};
	} catch (error) {
		return null;
	}
}

function isCloudflareChallenge(html) {
	return html.includes("Just a moment") && html.includes("cloudflare");
}

function extractArticleSummary(html) {
	const dekMatch = html.match(/class="[^"]*(?:shortform-article__dek|article__dek|c-dek)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i);
	if (dekMatch != null) {
		const text = decodeHtmlEntities(dekMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
		if (text.length > 0) {
			return text;
		}
	}

	return extractMetaContent(html, "og:description")
		?? extractMetaContent(html, "twitter:description")
		?? extractMetaName(html, "description");
}

function extractFeaturedImageUrl(html) {
	const metaImage = extractMetaImageUrl(html);
	if (metaImage != null && !isPlaceholderImage(metaImage)) {
		return metaImage;
	}

	const patterns = [
		/<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i,
		/<img[^>]*src="([^"]+)"[^>]*class="[^"]*wp-post-image[^"]*"/i,
		/<div[^>]*class="[^"]*c-article-header[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i,
		/<figure[^>]*class="[^"]*wp-block-image[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i,
		/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match != null) {
			const imageUrl = decodeHtmlEntities(match[1]);
			if (!isPlaceholderImage(imageUrl)) {
				return imageUrl.startsWith("http") ? imageUrl : `https:${imageUrl}`;
			}
		}
	}

	return metaImage;
}

function isPlaceholderImage(url) {
	return /Funny-Meme-Square|placeholder|1x1|pixel\.gif/i.test(url);
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
	const link = feedValueToString(item.link);
	if (link.length > 0) {
		return decodeHtmlEntities(link);
	}
	const guid = feedValueToString(item.guid);
	return guid.length > 0 ? decodeHtmlEntities(guid) : null;
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
