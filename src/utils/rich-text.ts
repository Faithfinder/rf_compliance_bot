import type { RichBlock, RichBlockCaption, RichBlockListItem, RichMessage, RichText } from "grammy/types";

/** Concatenates the visible text of a rich text node, dropping formatting information. */
export function flattenRichText(text: RichText | undefined): string {
    if (text === undefined) {
        return "";
    }

    if (typeof text === "string") {
        return text;
    }

    if (Array.isArray(text)) {
        return text.map(flattenRichText).join("");
    }

    switch (text.type) {
        // Custom emoji carry no text of their own, only a fallback emoji.
        case "custom_emoji":
            return text.alternative_text;
        case "mathematical_expression":
            return text.expression;
        // Anchors are invisible link targets.
        case "anchor":
            return "";
        default:
            return flattenRichText(text.text);
    }
}

function collectCaption(caption: RichBlockCaption | undefined, lines: string[]): void {
    if (!caption) {
        return;
    }

    lines.push(flattenRichText(caption.text));

    if (caption.credit !== undefined) {
        lines.push(flattenRichText(caption.credit));
    }
}

function collectListItems(items: RichBlockListItem[], lines: string[]): void {
    for (const item of items) {
        collectBlocks(item.blocks, lines);
    }
}

function collectBlock(block: RichBlock, lines: string[]): void {
    switch (block.type) {
        case "paragraph":
        case "heading":
        case "pre":
        case "footer":
        case "thinking":
            lines.push(flattenRichText(block.text));
            break;
        case "pullquote":
            lines.push(flattenRichText(block.text));
            if (block.credit !== undefined) {
                lines.push(flattenRichText(block.credit));
            }
            break;
        case "blockquote":
            collectBlocks(block.blocks, lines);
            if (block.credit !== undefined) {
                lines.push(flattenRichText(block.credit));
            }
            break;
        case "list":
            collectListItems(block.items, lines);
            break;
        case "details":
            lines.push(flattenRichText(block.summary));
            collectBlocks(block.blocks, lines);
            break;
        case "collage":
        case "slideshow":
            collectBlocks(block.blocks, lines);
            collectCaption(block.caption, lines);
            break;
        case "table":
            for (const row of block.cells) {
                lines.push(row.map((cell) => flattenRichText(cell.text)).join(" "));
            }
            if (block.caption !== undefined) {
                lines.push(flattenRichText(block.caption));
            }
            break;
        case "mathematical_expression":
            lines.push(block.expression);
            break;
        case "animation":
        case "audio":
        case "photo":
        case "video":
        case "voice_note":
        case "map":
            collectCaption(block.caption, lines);
            break;
        default: {
            // Telegram keeps adding block types, and missing the text of an unknown one would
            // reject a compliant message. Every text-bearing block published so far exposes its
            // content through these fields, so fall back to reading them structurally.
            const unknownBlock = block as {
                text?: RichText;
                summary?: RichText;
                blocks?: RichBlock[];
                items?: RichBlockListItem[];
                caption?: RichBlockCaption;
            };

            if (unknownBlock.summary !== undefined) {
                lines.push(flattenRichText(unknownBlock.summary));
            }

            if (unknownBlock.text !== undefined) {
                lines.push(flattenRichText(unknownBlock.text));
            }

            if (unknownBlock.blocks) {
                collectBlocks(unknownBlock.blocks, lines);
            }

            if (unknownBlock.items) {
                collectListItems(unknownBlock.items, lines);
            }

            collectCaption(unknownBlock.caption, lines);
            break;
        }
    }
}

function collectBlocks(blocks: RichBlock[], lines: string[]): void {
    for (const block of blocks) {
        collectBlock(block, lines);
    }
}

/**
 * Flattens a rich message into plain text, one line per block, so that it can be matched against
 * the required foreign agent blurb. Formatting, media and layout information is discarded.
 */
export function extractRichMessageText(richMessage: RichMessage): string {
    const lines: string[] = [];

    collectBlocks(richMessage.blocks ?? [], lines);

    return lines.filter((line) => line.length > 0).join("\n");
}
