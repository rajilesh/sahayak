/**
 * Tiny offline markdown renderer — handles what Gemma typically emits:
 * headings, bold, italic, code, bullet/numbered lists, paragraphs.
 * Also strips LaTeX-ish junk ($\ge$, ^\circ, \text{...}).
 */
function sanitizeLatex(s) {
  return s
    .replace(/\$\s*\\ge\s*/g, "≥")
    .replace(/\$\s*\\le\s*/g, "≤")
    .replace(/\^\s*\\circ/g, "°")
    .replace(/\\circ/g, "°")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\,/g, " ")
    .replace(/\$/g, "")
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "");
}

function _mdEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  s = _mdEscape(s);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s;
}

window.renderMarkdown = function (md) {
  if (!md) return "";
  md = sanitizeLatex(md);
  const lines = md.split(/\r?\n/);
  const out = [];
  let inUl = false, inOl = false, para = [];

  const flushPara = () => {
    if (para.length) {
      out.push("<p>" + inline(para.join(" ")) + "</p>");
      para = [];
    }
  };
  const closeLists = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };

  for (let raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); closeLists(); continue; }

    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); closeLists();
      const lv = m[1].length;
      out.push(`<h${lv + 2}>${inline(m[2])}</h${lv + 2}>`);
      continue;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (!inUl) { closeLists(); out.push("<ul>"); inUl = true; }
      out.push("<li>" + inline(m[1]) + "</li>");
      continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flushPara();
      if (!inOl) { closeLists(); out.push("<ol>"); inOl = true; }
      out.push("<li>" + inline(m[1]) + "</li>");
      continue;
    }
    closeLists();
    para.push(line);
  }
  flushPara(); closeLists();
  return out.join("\n");
};
