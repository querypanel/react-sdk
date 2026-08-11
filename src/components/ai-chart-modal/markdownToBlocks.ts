/**
 * Minimal markdown → BlockNote-ish insert descriptors.
 * Supports # / ## / ### headings and paragraph text. Skips complex GFM for v1.
 */
export type SimpleEditorBlock =
	| { type: "heading"; level: 1 | 2 | 3; text: string }
	| { type: "paragraph"; text: string };

export function markdownToSimpleEditorBlocks(markdown: string): SimpleEditorBlock[] {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const blocks: SimpleEditorBlock[] = [];
	let paragraph: string[] = [];

	const flushParagraph = () => {
		const text = paragraph.join("\n").trim();
		paragraph = [];
		if (text.length > 0) {
			blocks.push({ type: "paragraph", text });
		}
	};

	for (const line of lines) {
		const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
		if (heading) {
			flushParagraph();
			const level = heading[1].length as 1 | 2 | 3;
			blocks.push({ type: "heading", level, text: heading[2].trim() });
			continue;
		}

		if (line.trim().length === 0) {
			flushParagraph();
			continue;
		}

		paragraph.push(line);
	}

	flushParagraph();
	return blocks;
}
