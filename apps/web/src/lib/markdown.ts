const escapeHtml = (value: string) =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

const escapeAttribute = (value: string) => escapeHtml(value).replaceAll("`", "&#96;");

const renderInline = (value: string) => {
    let html = escapeHtml(value);

    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, text: string, href: string) => {
        return `<a href="${escapeAttribute(href)}">${text}</a>`;
    });

    return html;
};

const parseTableRow = (line: string) => {
    const trimmed = line.trim();
    const content = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
    const withoutTrailingPipe = content.endsWith("|") ? content.slice(0, -1) : content;

    return withoutTrailingPipe.split("|").map((cell) => cell.trim());
};

const isDividerRow = (cells: string[]) => cells.every((cell) => /^:?-{3,}:?$/.test(cell));

const renderTable = (rows: string[][]) => {
    const visibleRows = rows.filter((row) => !isDividerRow(row));

    if (visibleRows.length === 0) {
        return "";
    }

    const [header, ...body] = visibleRows;
    const headerHtml = header.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
    const bodyHtml = body
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
        .join("");

    return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
};

export const markdownToHtml = (markdown: string) => {
    const html: string[] = [];
    const paragraph: string[] = [];
    const tableRows: string[][] = [];
    let listType: "ul" | "ol" | null = null;

    const flushParagraph = () => {
        if (paragraph.length === 0) return;

        html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
        paragraph.length = 0;
    };

    const flushList = () => {
        if (!listType) return;

        html.push(`</${listType}>`);
        listType = null;
    };

    const flushTable = () => {
        if (tableRows.length === 0) return;

        const table = renderTable(tableRows);

        if (table) {
            html.push(table);
        }

        tableRows.length = 0;
    };

    const flushBlocks = () => {
        flushParagraph();
        flushList();
        flushTable();
    };

    for (const rawLine of markdown.trim().split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (trimmed.length === 0) {
            flushBlocks();
            continue;
        }

        if (trimmed.startsWith("|")) {
            flushParagraph();
            flushList();
            tableRows.push(parseTableRow(trimmed));
            continue;
        }

        flushTable();

        if (/^-{3,}$/.test(trimmed)) {
            flushParagraph();
            flushList();
            html.push("<hr />");
            continue;
        }

        const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);

        if (heading) {
            flushParagraph();
            flushList();

            const level = heading[1].length;
            html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            continue;
        }

        const quote = /^>\s?(.+)$/.exec(trimmed);

        if (quote) {
            flushParagraph();
            flushList();
            html.push(`<blockquote><p>${renderInline(quote[1])}</p></blockquote>`);
            continue;
        }

        const unordered = /^\s*[-*]\s+(.+)$/.exec(line);

        if (unordered) {
            flushParagraph();

            if (listType !== "ul") {
                flushList();
                html.push("<ul>");
                listType = "ul";
            }

            html.push(`<li>${renderInline(unordered[1])}</li>`);
            continue;
        }

        const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);

        if (ordered) {
            flushParagraph();

            if (listType !== "ol") {
                flushList();
                html.push("<ol>");
                listType = "ol";
            }

            html.push(`<li>${renderInline(ordered[1])}</li>`);
            continue;
        }

        flushList();
        paragraph.push(trimmed);
    }

    flushBlocks();

    return html.join("\n");
};
