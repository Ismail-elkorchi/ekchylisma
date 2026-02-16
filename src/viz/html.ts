import type { EvidenceBundle, Extraction } from "../core/types.ts";

export type VisualizationOptions = {
  title?: string;
  filterClass?: string;
  documentTextById?: Record<string, string>;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeExtractions(
  extractions: Extraction[],
  filterClass: string,
): Extraction[] {
  const scoped = filterClass === "all"
    ? extractions
    : extractions.filter((entry) => entry.extractionClass === filterClass);

  return [...scoped].sort((a, b) => a.span.charStart - b.span.charStart);
}

function renderHighlights(
  documentText: string,
  extractions: Extraction[],
): string {
  if (!documentText) {
    return '<p class="viz-empty">Document text not provided for this document.</p>';
  }

  const filtered = extractions.filter(
    (entry) =>
      entry.span.charStart >= 0 &&
      entry.span.charEnd >= entry.span.charStart &&
      entry.span.charEnd <= documentText.length,
  );

  let cursor = 0;
  const chunks: string[] = [];

  for (const extraction of filtered) {
    const { charStart, charEnd } = extraction.span;
    if (charStart < cursor) {
      continue;
    }

    chunks.push(escapeHtml(documentText.slice(cursor, charStart)));
    chunks.push(
      `<mark class=\"viz-mark\" data-start=\"${charStart}\" data-end=\"${charEnd}\" data-class=\"${
        escapeHtml(extraction.extractionClass)
      }\">${escapeHtml(documentText.slice(charStart, charEnd))}</mark>`,
    );
    cursor = charEnd;
  }

  chunks.push(escapeHtml(documentText.slice(cursor)));

  return `<pre class=\"viz-document\">${chunks.join("")}</pre>`;
}

function renderExtractionList(extractions: Extraction[]): string {
  if (extractions.length === 0) {
    return '<li class="viz-empty">No extractions for this filter.</li>';
  }

  return extractions
    .map(
      (entry) =>
        `<li data-class=\"${escapeHtml(entry.extractionClass)}\">` +
        `<strong>${escapeHtml(entry.extractionClass)}</strong> ` +
        `[${entry.span.charStart}, ${entry.span.charEnd}) ` +
        `<code>${escapeHtml(entry.quote)}</code>` +
        "</li>",
    )
    .join("");
}

function collectClasses(bundles: EvidenceBundle[]): string[] {
  const unique = new Set<string>();
  for (const bundle of bundles) {
    for (const extraction of bundle.extractions) {
      unique.add(extraction.extractionClass);
    }
  }

  return [...unique].sort();
}

function renderBundleSections(
  bundles: EvidenceBundle[],
  filterClass: string,
  documentTextById: Record<string, string>,
): string {
  return bundles
    .map((bundle) => {
      const docId = bundle.provenance.documentId;
      const docText = documentTextById[docId] ?? "";
      const filtered = normalizeExtractions(bundle.extractions, filterClass);

      return `<section class=\"viz-bundle\" data-document-id=\"${
        escapeHtml(docId)
      }\">` +
        `<h2>${escapeHtml(docId)}</h2>` +
        renderHighlights(docText, filtered) +
        `<ul class=\"viz-list\">${renderExtractionList(filtered)}</ul>` +
        "</section>";
    })
    .join("\n");
}

export function visualizeEvidenceBundle(
  bundles: EvidenceBundle[],
  options: VisualizationOptions = {},
): string {
  const filterClass = options.filterClass ?? "all";
  const documentTextById = options.documentTextById ?? {};
  const title = options.title ?? "ekchylisma visualization";
  const classes = collectClasses(bundles);

  const dataPayload = {
    bundles,
    classes,
    options: {
      title,
      filterClass,
      documentTextById,
    },
  };

  const sections = renderBundleSections(bundles, filterClass, documentTextById);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light; }
body { margin: 0; font-family: "IBM Plex Sans", "Source Sans 3", sans-serif; background: linear-gradient(135deg, #f8f6f2, #efe7dd); color: #1e1a16; }
main { max-width: 980px; margin: 2rem auto; padding: 0 1rem 3rem; }
header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; align-items: center; margin-bottom: 1.5rem; }
.viz-controls { display: flex; gap: .5rem; align-items: center; }
label { font-weight: 600; }
select { padding: .4rem .6rem; border-radius: .5rem; border: 1px solid #ab9f92; background: #fffdf9; }
.viz-bundle { background: #fffdf9; border: 1px solid #d8cec2; border-radius: 1rem; padding: 1rem; margin-bottom: 1rem; box-shadow: 0 10px 25px rgba(40, 25, 10, 0.08); }
.viz-document { background: #f6efe7; border-radius: .7rem; padding: .75rem; white-space: pre-wrap; line-height: 1.45; }
.viz-mark { background: #f6b756; color: #1f1303; border-radius: .2rem; padding: 0 .1rem; }
.viz-list { margin: .8rem 0 0; padding-left: 1rem; display: grid; gap: .35rem; }
.viz-empty { color: #6a6157; }
</style>
</head>
<body>
<main>
<header>
<h1>${escapeHtml(title)}</h1>
<div class="viz-controls">
<label for="class-filter">Extraction class</label>
<select id="class-filter">
<option value="all">all</option>
${
    classes.map((entry) =>
      `<option value="${escapeHtml(entry)}">${escapeHtml(entry)}</option>`
    ).join("")
  }
</select>
</div>
</header>
<div id="viz-root">${sections}</div>
</main>
<script id="__ek_data" type="application/json">${
    escapeHtml(JSON.stringify(dataPayload))
  }</script>
<script>
const payload = JSON.parse(document.getElementById('__ek_data').textContent);
const select = document.getElementById('class-filter');
if (payload.options.filterClass && select) select.value = payload.options.filterClass;
const esc = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;');
const sorted = (items, cls) => (cls === 'all' ? items : items.filter((entry) => entry.extractionClass === cls))
  .slice()
  .sort((a, b) => a.span.charStart - b.span.charStart);
const renderDoc = (text, items) => {
  if (!text) return '<p class="viz-empty">Document text not provided for this document.</p>';
  let cursor = 0;
  let html = '';
  for (const entry of items) {
    const start = entry.span.charStart;
    const end = entry.span.charEnd;
    if (start < cursor || start < 0 || end < start || end > text.length) continue;
    html += esc(text.slice(cursor, start));
    html += '<mark class="viz-mark" data-start="' + start + '" data-end="' + end + '" data-class="' + esc(entry.extractionClass) + '">' + esc(text.slice(start, end)) + '</mark>';
    cursor = end;
  }
  html += esc(text.slice(cursor));
  return '<pre class="viz-document">' + html + '</pre>';
};
const renderList = (items) => {
  if (items.length === 0) return '<li class="viz-empty">No extractions for this filter.</li>';
  return items.map((entry) => '<li data-class="' + esc(entry.extractionClass) + '"><strong>' + esc(entry.extractionClass) + '</strong> [' + entry.span.charStart + ', ' + entry.span.charEnd + ') <code>' + esc(entry.quote) + '</code></li>').join('');
};
const render = () => {
  const cls = select ? select.value : 'all';
  const root = document.getElementById('viz-root');
  if (!root) return;
  root.innerHTML = payload.bundles.map((bundle) => {
    const docId = bundle.provenance.documentId;
    const docText = (payload.options.documentTextById || {})[docId] || '';
    const items = sorted(bundle.extractions, cls);
    return '<section class="viz-bundle" data-document-id="' + esc(docId) + '">' +
      '<h2>' + esc(docId) + '</h2>' +
      renderDoc(docText, items) +
      '<ul class="viz-list">' + renderList(items) + '</ul>' +
      '</section>';
  }).join('\n');
};
if (select) select.addEventListener('change', render);
render();
</script>
</body>
</html>`;
}
