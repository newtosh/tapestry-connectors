// com.uncrate.feed
//
// Optimized Uncrate RSS connector (FeedBurner feed).

const UNCRATE_ICON = loadIconUrl();
const UNCRATE_BASE_URL = "https://uncrate.com";

const userAgent = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3";

function loadIconUrl() {
	const iconUrl = require("icon-url.txt");
	if (iconUrl === false) {
		throw new Error("Missing resources/icon-url.txt — run: make build");
	}
	return iconUrl;
}

function createFeedIdentity() {
	const identity = Identity.createWithName("Uncrate");
	identity.uri = UNCRATE_BASE_URL;
	identity.avatar = UNCRATE_ICON;
	return identity;
}

async function verify() {
	processVerification({
		displayName: "Uncrate",
		icon: UNCRATE_ICON,
		baseUrl: UNCRATE_BASE_URL,
		accountIdentity: createFeedIdentity()
	});
}

async function load() {
	const response = await sendConditionalRequest(site, "GET", null, {"user-agent": userAgent});

	if (!response) {
		processResults([]);
		return;
	}

	const jsonObject = await xmlParse(response);

	if (jsonObject.rss != null && jsonObject.rss.channel != null) {
		let items = [];
		if (jsonObject.rss.channel.item != null) {
			const item = jsonObject.rss.channel.item;
			items = item instanceof Array ? item : [item];
		}

		const results = [];
		for (const item of items) {
			const url = item.link ?? item.guid;
			if (url == null) {
				continue;
			}

			let itemDate = item["pubDate"] ?? item["dc:date"] ?? item["a10:updated"];
			if (itemDate?.endsWith(" Z")) {
				itemDate = itemDate.slice(0, -2) + "GMT";
			}
			const date = (itemDate == null ? new Date() : new Date(itemDate));

			const title = extractString(item.title);
			let content = extractString((item["content:encoded"] ?? item.description), true);
			if (content != null) {
				content = cleanUncrateBody(content);
			}

			let heroImageUrl = null;
			const enrichment = await enrichFromArticlePage(url);
			if (enrichment != null) {
				heroImageUrl = enrichment.imageUrl;
				if (enrichment.purchaseLink != null) {
					if (content != null && content.length > 0) {
						content += `\n${enrichment.purchaseLink}`;
					} else {
						content = enrichment.purchaseLink;
					}
				}
			}

			const resultItem = Item.createWithUriDate(url, date);
			if (title != null) {
				resultItem.title = title;
			}
			if (content != null && content.length > 0) {
				resultItem.body = content;
			}
			resultItem.author = createFeedIdentity();

			const category = formatCategory(item.category);
			if (category != null) {
				resultItem.annotations = [Annotation.createWithText(category)];
			}

			const attachments = [];
			if (heroImageUrl != null) {
				attachments.push(MediaAttachment.createWithUrl(heroImageUrl));
			} else if (item["enclosure$attrs"] != null) {
				const enclosure = item["enclosure$attrs"];
				if (enclosure.url != null) {
					attachments.push(MediaAttachment.createWithUrl(enclosure.url));
				}
			}

			if (attachments.length > 0) {
				resultItem.attachments = attachments;
			}

			results.push(resultItem);
		}

		processResults(results);
	} else {
		processResults([]);
	}
}

async function enrichFromArticlePage(url) {
	try {
		const html = await sendRequest(url, "GET", null, {"user-agent": userAgent});
		if (html == null || html.length === 0) {
			return null;
		}

		const canonicalUrl = extractCanonicalUrl(html) ?? url;
		const pageType = extractMetaContent(html, "og:type");
		const imageUrl = extractMetaImageUrl(html);

		if (isShopProductPage(pageType, canonicalUrl, html)) {
			const priceAmount = extractMetaContent(html, "og:price:amount");
			const priceCurrency = extractMetaContent(html, "og:price:currency") ?? "USD";
			const price = formatPrice(priceAmount, priceCurrency);
			return {
				purchaseLink: formatPurchaseLinkParagraph(canonicalUrl, "Buy from Uncrate Supply", price),
				imageUrl
			};
		}

		const purchaseLink = extractArticlePurchaseLink(html);
		if (purchaseLink == null && imageUrl == null) {
			return null;
		}

		return {purchaseLink, imageUrl};
	} catch (error) {
		return null;
	}
}

function isShopProductPage(pageType, canonicalUrl, html) {
	if (pageType === "product") {
		return true;
	}
	if (canonicalUrl.includes("shop.uncrate.com/products/")) {
		return true;
	}
	return html.includes("shopify-section") && html.includes("product-form");
}

function extractArticlePurchaseLink(html) {
	const mainHtml = html.slice(0, 200000);
	const scopes = [];

	const productGridMatch = mainHtml.match(/<div class="article-single[^"]*product-option-grid"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
	if (productGridMatch != null) {
		scopes.push(productGridMatch[0]);
	}
	scopes.push(mainHtml);

	for (const scope of scopes) {
		const buyMatch = scope.match(/<div class="buy">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span class="action">([^<]+)<\/span>[\s\S]*?<\/a>/i);
		if (buyMatch != null) {
			const href = decodeHtmlEntities(buyMatch[1]);
			const source = decodeHtmlEntities(buyMatch[2].trim());
			const priceMatch = scope.match(/<span class="cost[^"]*">([^<]+)<\/span>/i);
			const price = priceMatch != null ? formatPrice(decodeHtmlEntities(priceMatch[1].trim())) : null;
			return formatPurchaseLinkParagraph(href, source, price);
		}

		const supplyMatch = scope.match(/<p class="action-links">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>\s*Buy From Uncrate Supply\s*<\/a>/i);
		if (supplyMatch != null) {
			const href = decodeHtmlEntities(supplyMatch[1]);
			const priceMatch = scope.match(/\$([0-9][0-9,]*\+?)/);
			const price = priceMatch != null ? `$${priceMatch[1]}` : null;
			return formatPurchaseLinkParagraph(href, "Buy from Uncrate Supply", price);
		}
	}

	return null;
}

function formatPurchaseLinkParagraph(href, source, price) {
	let label = source;
	if (price != null && price.length > 0) {
		label += ` · ${price}`;
	}
	return `<p class="purchase-link"><a href="${href}">${escapeHtml(label)}</a></p>`;
}

function formatPrice(amount, currency = "USD") {
	if (amount == null || String(amount).trim().length === 0) {
		return null;
	}

	const text = String(amount).trim();
	if (text.includes("+") || text.includes(",")) {
		return currency === "USD" ? `$${text}` : `${text} ${currency}`;
	}

	const value = Number.parseFloat(text);
	if (Number.isNaN(value)) {
		return currency === "USD" ? `$${text}` : `${text} ${currency}`;
	}

	if (currency === "USD") {
		if (Number.isInteger(value)) {
			return `$${value.toLocaleString("en-US")}`;
		}
		return `$${value.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
	}

	return `${text} ${currency}`;
}

function extractMetaContent(html, property) {
	const match = html.match(new RegExp(`<meta[^>]*property="${property}"[^>]*content="([^"]+)"`, "i"))
		?? html.match(new RegExp(`<meta[^>]*content="([^"]+)"[^>]*property="${property}"`, "i"));
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

function extractCanonicalUrl(html) {
	const match = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i)
		?? html.match(/<link[^>]*href="([^"]+)"[^>]*rel="canonical"/i);
	return match != null ? decodeHtmlEntities(match[1]) : null;
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

function formatCategory(category) {
	if (category == null) {
		return null;
	}
	if (category instanceof Array) {
		return category.map((value) => String(value).trim()).filter((value) => value.length > 0).join(", ");
	}
	const text = String(category).trim();
	return text.length > 0 ? text : null;
}

function cleanUncrateBody(bodyHtml) {
	let body = bodyHtml;
	body = body.replace(/<div style="float:\s*left;[^"]*">[\s\S]*?<\/div>/i, "");
	body = body.replace(/<br\s*\/?>\s*<br\s*\/?>\s*Visit\s+<a[^>]*>Uncrate<\/a>\s+for the full post\.?\s*/i, "");
	body = body.replace(/<br\s*\/?>/gi, " ");
	body = body.replace(/\s+/g, " ").trim();
	if (body.length > 0 && !/^<p[\s>]/i.test(body)) {
		body = `<p>${body}</p>`;
	}
	return body;
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
