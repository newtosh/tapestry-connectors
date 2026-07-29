// com.gearpatrol.feed
//
// Optimized Gear Patrol RSS connector.

const GEAR_PATROL_ICON = loadIconUrl();
const GEAR_PATROL_BASE_URL = "https://www.gearpatrol.com";

const userAgent = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3";

function loadIconUrl() {
	const iconUrl = require("icon-url.txt");
	if (iconUrl === false) {
		throw new Error("Missing resources/icon-url.txt — run: make build");
	}
	return iconUrl;
}

function createFeedIdentity(authorName = null) {
	const identity = Identity.createWithName("Gear Patrol");
	identity.uri = GEAR_PATROL_BASE_URL;
	identity.avatar = GEAR_PATROL_ICON;
	if (authorName != null && authorName.length > 0) {
		identity.username = `by ${authorName}`;
	}
	return identity;
}

async function verify() {
	const response = await sendRequest(site, "GET", null, {"user-agent": userAgent});
	const jsonObject = await xmlParse(response);

	if (jsonObject.rss != null && jsonObject.rss.channel != null) {
		const channel = jsonObject.rss.channel;
		processVerification({
			displayName: extractString(channel.title) ?? "Gear Patrol",
			icon: GEAR_PATROL_ICON,
			baseUrl: GEAR_PATROL_BASE_URL,
			accountIdentity: createFeedIdentity()
		});
	}
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
			const encodedContent = extractString(item["content:encoded"], true);
			let content = extractString(item.description);
			if (content != null && content.length > 0) {
				content = `<p>${escapeHtml(content)}</p>`;
			}

			if (encodedContent != null) {
				const purchaseLinks = extractPurchaseLinksFromHtml(encodedContent);
				if (purchaseLinks != null) {
					if (content != null && content.length > 0) {
						content += `\n${purchaseLinks}`;
					} else {
						content = purchaseLinks;
					}
				}
			}

			let authorName = item["dc:creator"];
			if (authorName != null) {
				if (authorName instanceof Array) {
					authorName = authorName.join(", ");
				} else {
					authorName = String(authorName).trim();
				}
			}

			const resultItem = Item.createWithUriDate(url, date);
			if (title != null) {
				resultItem.title = title;
			}
			if (content != null && content.length > 0) {
				resultItem.body = content;
			}
			resultItem.author = createFeedIdentity(authorName);

			const category = formatCategory(item.category);
			if (category != null) {
				resultItem.annotations = [Annotation.createWithText(category)];
			}

			const attachments = [];
			let heroImageUrl = attachmentUrlFromMedia(item["media:thumbnail$attrs"]);
			if (heroImageUrl == null) {
				heroImageUrl = attachmentUrlFromMedia(item["media:content$attrs"]);
			}
			if (heroImageUrl == null && encodedContent != null) {
				heroImageUrl = extractFeaturedImageUrl(encodedContent);
			}

			if (heroImageUrl != null) {
				attachments.push(MediaAttachment.createWithUrl(heroImageUrl));
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

function extractPurchaseLinksFromHtml(html) {
	const scopeMatch = html.match(/<ul class="wp-block-gearpatrol-product-retailer-links">([\s\S]*?)<\/ul>/i);
	if (scopeMatch == null) {
		return null;
	}

	const paragraphs = [];
	const anchorRegex = /<a[^>]*wp-block-gearpatrol-product-retailer-links__retailer__link[^>]*>[\s\S]*?<\/a>/gi;
	let anchorMatch = anchorRegex.exec(scopeMatch[1]);
	while (anchorMatch != null) {
		const anchor = anchorMatch[0];
		const hrefMatch = anchor.match(/href="([^"]+)"/i);
		const textMatch = anchor.match(/>([^<]+)<\/a>/i);
		if (hrefMatch != null && textMatch != null) {
			const href = decodeHtmlEntities(hrefMatch[1]);
			const label = decodeHtmlEntities(textMatch[1].replace(/\s+/g, " ").trim());
			if (label.length > 0) {
				paragraphs.push(formatPurchaseLinkParagraph(href, label));
			}
		}
		anchorMatch = anchorRegex.exec(html);
	}

	return paragraphs.length > 0 ? paragraphs.join("\n") : null;
}

function extractFeaturedImageUrl(html) {
	const match = html.match(/<figure[^>]*wp-block-post-featured-image[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
	return match != null ? decodeHtmlEntities(match[1]) : null;
}

function attachmentUrlFromMedia(mediaAttributes) {
	if (mediaAttributes?.url != null) {
		return mediaAttributes.url;
	}
	return null;
}

function formatPurchaseLinkParagraph(href, label) {
	return `<p class="purchase-link"><a href="${href}">${escapeHtml(label)}</a></p>`;
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
