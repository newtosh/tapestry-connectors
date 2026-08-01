// com.reactor.feed
//
// Optimized Reactor (reactormag.com) RSS connector.
// Strips WordPress post-hero chrome that pollutes the generic Blog Feed timeline.

const REACTOR_ICON = loadIconUrl();
const REACTOR_BASE_URL = "https://reactormag.com";

const userAgent = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3";

function loadIconUrl() {
	const iconUrl = require("icon-url.txt");
	if (iconUrl === false) {
		throw new Error("Missing resources/icon-url.txt — run: make build");
	}
	return iconUrl;
}

function createFeedIdentity() {
	const identity = Identity.createWithName("Reactor");
	identity.uri = REACTOR_BASE_URL;
	identity.avatar = REACTOR_ICON;
	return identity;
}

async function verify() {
	processVerification({
		displayName: "Reactor",
		icon: REACTOR_ICON,
		baseUrl: REACTOR_BASE_URL,
		accountIdentity: createFeedIdentity()
	});
}

async function load() {
	let response = await sendConditionalRequest(site, "GET", null, {"user-agent": userAgent});
	// Conditional GET can return null/empty after connector upgrades; fall back
	// so the timeline is not wiped (same pattern as Cool Material).
	if (response == null || response.length === 0) {
		response = await sendRequest(site, "GET", null, {"user-agent": userAgent});
	}

	if (response == null || response.length === 0) {
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
			if (item.link == null) {
				continue;
			}

			let itemDate = item["pubDate"] ?? item["dc:date"] ?? item["a10:updated"];
			if (itemDate?.endsWith(" Z")) {
				itemDate = itemDate.slice(0, -2) + "GMT";
			}
			const date = (itemDate == null ? new Date() : new Date(itemDate));

			let url = item.link;
			const urlClean = url.split("?").splice(0, 1).join();
			const urlParameters = url.split("?").splice(1).join("?");
			if (urlParameters.includes("utm_id") || urlParameters.includes("utm_source") || urlParameters.includes("utm_medium") || urlParameters.includes("utm_campaign")) {
				url = urlClean;
			}

			const title = extractString(item.title);
			const description = extractString(item.description, true);
			const encodedContent = extractString(item["content:encoded"], true) ?? description;
			let content = cleanReactorBody(encodedContent);

			const dek = extractDek(encodedContent, description);
			if (dek != null) {
				content = prependDek(content, dek);
			}

			let authorName = item["dc:creator"] ?? item["author"];
			if (authorName != null) {
				if (authorName instanceof Array) {
					authorName = authorName.join(", ");
				} else {
					authorName = String(authorName).trim();
				}
			}

			if (authorName != null && authorName.length > 0) {
				content = prependByline(content, authorName);
			}

			const resultItem = Item.createWithUriDate(url, date);
			if (title != null) {
				resultItem.title = title;
			}
			if (content != null && content.length > 0) {
				resultItem.body = fixInlineTagSpacing(content);
			}
			// Post layout: feed identity avatar is the only way to show the branded icon.
			resultItem.author = createFeedIdentity();

			const attachments = [];
			const heroImageUrl = extractHeroImageUrl(encodedContent);
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

function cleanReactorBody(bodyHtml) {
	if (bodyHtml == null) {
		return null;
	}

	let body = bodyHtml;
	// Full WordPress post hero: title, dek, byline, date, captions, share/comment chrome.
	body = body.replace(/<post-hero\b[\s\S]*?<\/post-hero>/gi, "");
	body = body.replace(/<div class="wp-block-more-from-category">[\s\S]*?<\/div>\s*<\/div>/gi, "");
	body = body.replace(/<p[^>]*>\s*The post\s*<a[\s\S]*?appeared first on[\s\S]*?<\/p>/gi, "");
	body = body.replace(/\[end-mark\]/g, "");
	body = body.replace(/<p[^>]*>\s*<\/p>/gi, "");
	body = body.replace(/\n{3,}/g, "\n\n").trim();
	return body.length > 0 ? body : null;
}

function extractDek(contentHtml, descriptionHtml) {
	if (contentHtml != null) {
		const heroDekMatch = contentHtml.match(/post-hero-description[^>]*>([\s\S]*?)<\/div>/i);
		if (heroDekMatch != null) {
			const text = stripTags(heroDekMatch[1]);
			if (text.length > 0) {
				return text;
			}
		}
	}

	if (descriptionHtml != null) {
		const paragraphMatch = descriptionHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
		if (paragraphMatch != null && !/appeared first on/i.test(paragraphMatch[1])) {
			const text = stripTags(paragraphMatch[1]);
			if (text.length > 0) {
				return text;
			}
		}
	}

	return null;
}

function extractHeroImageUrl(contentHtml) {
	if (contentHtml == null) {
		return null;
	}

	const figureMatch = contentHtml.match(/<figure[^>]*post-hero-image[\s\S]*?<img[^>]+src="([^"]+)"/i);
	if (figureMatch != null) {
		return decodeHtmlEntities(figureMatch[1]);
	}

	const ogStyleMatch = contentHtml.match(/<img[^>]+class="[^"]*post-hero[^"]*"[^>]+src="([^"]+)"/i);
	if (ogStyleMatch != null) {
		return decodeHtmlEntities(ogStyleMatch[1]);
	}

	return null;
}

function prependDek(content, dek) {
	const normalizedDek = normalizeText(dek);
	if (normalizedDek != null && content != null) {
		const normalizedBody = normalizeText(content);
		if (normalizedBody != null && (normalizedBody.startsWith(normalizedDek) || normalizedBody.includes(normalizedDek))) {
			return content;
		}
	}

	const dekHtml = `<p><em>${escapeHtml(dek)}</em></p>`;
	if (content == null || content.length === 0) {
		return dekHtml;
	}
	return `${dekHtml}\n${content}`;
}

function prependByline(content, authorName) {
	const byline = `<p>by ${escapeHtml(authorName)}</p>`;
	if (content == null || content.length === 0) {
		return byline;
	}
	return `${byline}\n${content}`;
}

function stripTags(html) {
	return decodeHtmlEntities(
		String(html)
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim()
	);
}

function fixInlineTagSpacing(bodyHtml) {
	return bodyHtml.replace(/<\/(em|strong|i|b|a)>(?=[A-Za-z0-9])/g, "</$1> ");
}

function normalizeText(text) {
	if (text == null) {
		return null;
	}
	return text
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function escapeHtml(text) {
	return String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function decodeHtmlEntities(text) {
	return String(text)
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
