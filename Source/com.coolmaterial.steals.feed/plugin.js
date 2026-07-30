// com.coolmaterial.steals.feed
//
// Optimized Cool Material Steals RSS connector.

const COOL_MATERIAL_ICON = loadIconUrl();
const COOL_MATERIAL_BASE_URL = "https://coolmaterial.com";

const userAgent = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3";

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
		const channel = jsonObject.rss.channel;
		processVerification({
			displayName: "Cool Material Steals",
			icon: COOL_MATERIAL_ICON,
			baseUrl: COOL_MATERIAL_BASE_URL,
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
			const url = extractItemUri(item);
			if (url == null) {
				continue;
			}

			let itemDate = item["pubDate"] ?? item["dc:date"] ?? item["a10:updated"];
			if (itemDate?.endsWith(" Z")) {
				itemDate = itemDate.slice(0, -2) + "GMT";
			}
			const date = (itemDate == null ? new Date() : new Date(itemDate));

			const title = extractString(item.title);
			const descriptionHtml = extractString(item.description, true);
			const steal = descriptionHtml != null ? parseStealDescription(descriptionHtml) : null;

			let content = null;
			if (steal?.href != null && steal.purchaseLabel != null) {
				content = appendPurchaseLinksToContent(null, [{
					href: steal.href,
					label: steal.purchaseLabel
				}]);
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

			results.push(resultItem);
		}

		processResults(results);
	} else {
		processResults([]);
	}
}

function extractItemUri(item) {
	const guid = extractString(item.guid);
	if (guid != null && guid.length > 0) {
		return decodeHtmlEntities(guid);
	}
	return item.link ?? null;
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
		: null;

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
