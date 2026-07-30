// com.polygon.feed
//
// Optimized Polygon.com RSS connector.
// Forked from TheIconfactory Tapestry xml.feed connector.

const POLYGON_ICON = loadIconUrl();
const POLYGON_BASE_URL = "https://www.polygon.com";

const userAgent = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; de-de) AppleWebKit/531.22.7 (KHTML, like Gecko) NetNewsWire/3.2.7 Tapestry/1.3";

function loadIconUrl() {
	const iconUrl = require("icon-url.txt");
	if (iconUrl === false) {
		throw new Error("Missing resources/icon-url.txt — run: make build");
	}
	return iconUrl;
}

function createFeedIdentity() {
	const identity = Identity.createWithName("Polygon");
	identity.uri = POLYGON_BASE_URL;
	identity.avatar = POLYGON_ICON;
	return identity;
}

async function verify() {
	processVerification({
		displayName: "Polygon",
		icon: POLYGON_ICON,
		baseUrl: POLYGON_BASE_URL,
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
			let content = extractString((item["content:encoded"] ?? item.description), true);

			if (description != null && content != null) {
				content = dedupeDescriptionFromBody(description, content);
			}

			let authorName = item["dc:creator"] ?? item["author"];
			if (authorName != null) {
				if (authorName instanceof Array) {
					authorName = authorName.join(", ");
				} else {
					authorName = authorName.trim();
				}
			}

			if (authorName != null && authorName.length > 0) {
				content = prependByline(content, authorName);
			}

			const resultItem = Item.createWithUriDate(url, date);
			if (title != null) {
				resultItem.title = title;
			}
			if (content != null) {
				resultItem.body = fixInlineTagSpacing(content);
			}
			resultItem.author = createFeedIdentity();

			const attachments = [];

			if (item["media:group"] != null) {
				const attachment = attachmentForAttributes(item["media:group"]["media:thumbnail$attrs"]);
				if (attachment != null) {
					attachments.push(attachment);
				}
			} else if (item["media:thumbnail$attrs"] != null) {
				const attachment = attachmentForAttributes(item["media:thumbnail$attrs"]);
				if (attachment != null) {
					attachments.push(attachment);
				}
			} else if (item["media:content$attrs"] != null) {
				const attachment = attachmentForAttributes(item["media:content$attrs"]);
				if (attachment != null) {
					attachments.push(attachment);
				}
			} else if (item["enclosure$attrs"] != null) {
				const enclosure = item["enclosure$attrs"];
				if (enclosure.url != null) {
					const attachment = MediaAttachment.createWithUrl(enclosure.url);
					attachments.push(attachment);
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

function prependByline(content, authorName) {
	// Leading/trailing <br> approximate Verge article spacing around the byline.
	const byline = `<p><br>by ${escapeHtml(authorName)}<br></p>`;
	if (content == null || content.length === 0) {
		return byline;
	}
	return `${byline}\n${content}`;
}

function escapeHtml(text) {
	return String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
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

function dedupeDescriptionFromBody(description, bodyHtml) {
	const normalizedDescription = normalizeText(description);
	if (normalizedDescription == null || normalizedDescription.length === 0) {
		return bodyHtml;
	}

	const firstParagraphMatch = bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
	if (firstParagraphMatch == null) {
		return bodyHtml;
	}

	const firstParagraphHtml = firstParagraphMatch[0];
	const firstParagraphText = normalizeText(firstParagraphMatch[1]);

	if (firstParagraphText == null) {
		return bodyHtml;
	}

	if (firstParagraphText === normalizedDescription || firstParagraphText.startsWith(normalizedDescription) || normalizedDescription.startsWith(firstParagraphText)) {
		return bodyHtml.slice(firstParagraphHtml.length).trim();
	}

	return bodyHtml;
}

function attachmentForAttributes(mediaAttributes) {
	let attachment = null;
	if (mediaAttributes != null && mediaAttributes.url != null) {
		let url = mediaAttributes.url;
		if (url.includes("&amp;")) {
			url = url.replaceAll("&amp;", "&");
		}
		attachment = MediaAttachment.createWithUrl(url);
		if (mediaAttributes.width != null && mediaAttributes.height != null) {
			attachment.aspectSize = {
				width: mediaAttributes.width,
				height: mediaAttributes.height
			};
		}
	}
	return attachment;
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
