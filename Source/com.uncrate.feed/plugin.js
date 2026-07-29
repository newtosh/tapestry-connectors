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
			let content = null;
			let heroImageUrl = null;
			const article = await fetchUncrateArticleContent(url);
			if (article != null) {
				content = article.body;
				heroImageUrl = article.imageUrl;
			}
			if (content == null) {
				content = extractString((item["content:encoded"] ?? item.description), true);
				if (content != null) {
					content = cleanUncrateBody(content);
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

async function fetchUncrateArticleContent(url) {
	try {
		const html = await sendRequest(url, "GET", null, {"user-agent": userAgent});
		if (html == null || html.length === 0) {
			return null;
		}

		const body = buildArticleBodyFromHtml(html);
		const imageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)
			?? html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
		const imageUrl = imageMatch != null ? decodeHtmlEntities(imageMatch[1]) : null;

		if (body == null && imageUrl == null) {
			return null;
		}

		return {body, imageUrl};
	} catch (error) {
		return null;
	}
}

function buildArticleBodyFromHtml(html) {
	const paragraphs = extractCopyWrapperParagraphs(html);
	if (paragraphs == null || paragraphs.length === 0) {
		return null;
	}

	let body = paragraphs.join("\n");
	const buyLink = extractBuyLinkParagraph(html);
	if (buyLink != null) {
		body += `\n${buyLink}`;
	}

	return body;
}

function extractCopyWrapperParagraphs(html) {
	const match = html.match(/<div class="copy-wrapper[^"]*">[\s\S]*?<h[12][^>]*class="article-title"[\s\S]*?<\/h[12]>([\s\S]*?)<\/div>\s*(?:<div class="ad-wrapper"|<!-- mt:Ignore)/i);
	if (match == null) {
		return null;
	}

	const paragraphs = [];
	const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
	let paragraphMatch = paragraphRegex.exec(match[1]);
	while (paragraphMatch != null) {
		const innerHtml = paragraphMatch[1].trim();
		if (innerHtml.length > 0) {
			paragraphs.push(`<p>${innerHtml}</p>`);
		}
		paragraphMatch = paragraphRegex.exec(match[1]);
	}

	return paragraphs.length > 0 ? paragraphs : null;
}

function extractBuyLinkParagraph(html) {
	const match = html.match(/<div class="buy">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span class="action">([^<]+)<\/span>[\s\S]*?<\/a>/i);
	if (match == null) {
		return null;
	}

	const href = decodeHtmlEntities(match[1]);
	const action = decodeHtmlEntities(match[2].trim());
	const priceMatch = html.match(/<div class="buy">[\s\S]*?<span class="cost[^"]*">([^<]+)<\/span>/i);
	const price = priceMatch != null ? decodeHtmlEntities(priceMatch[1].trim()) : null;
	let label = action;
	if (price != null && price.length > 0) {
		label += ` — $${price}`;
	}

	return `<p><a href="${href}">${label}</a></p>`;
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
