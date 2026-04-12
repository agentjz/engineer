const state = {
  primaryDocs: [],
  allowedDocs: new Set(),
  docTitleMap: new Map(),
  docContentMap: new Map(),
  primaryMap: new Map(),
  primarySectionMap: new Map(),
  docKeyToPath: new Map(),
  pathToDocKey: new Map(),
  currentDetailPath: "",
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  initializePage();
});

function bindElements() {
  elements.page = document.getElementById("page");
  elements.detailPanel = document.getElementById("detailPanel");
  elements.detailTitle = document.getElementById("detailTitle");
  elements.detailContent = document.getElementById("detailContent");
  elements.closeDetail = document.getElementById("closeDetail");
}

function bindEvents() {
  elements.closeDetail.addEventListener("click", closeDetail);
  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("hashchange", applyHashRoute);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDetail();
    }
  });
}

async function initializePage() {
  try {
    if (!window.marked || typeof window.marked.parse !== "function") {
      throw new Error("Marked library is not available");
    }

    if (typeof window.marked.setOptions === "function") {
      window.marked.setOptions({
        gfm: true,
        breaks: false,
      });
    }

    const siteIndex = await loadIndex();
    state.primaryDocs = siteIndex.primaryDocs || [];
    state.allowedDocs = new Set(
      (siteIndex.allowedDocs || []).map((doc) => normalizePath(getDocPath(doc))),
    );
    state.docTitleMap = new Map(
      (siteIndex.allowedDocs || [])
        .filter((doc) => typeof doc === "object" && doc && doc.path && doc.title)
        .map((doc) => [normalizePath(doc.path), doc.title]),
    );
    state.docContentMap = new Map([
      ...state.primaryDocs
        .filter((doc) => typeof doc === "object" && doc && doc.path && typeof doc.content === "string")
        .map((doc) => [normalizePath(doc.path), doc.content]),
      ...(siteIndex.allowedDocs || [])
        .filter((doc) => typeof doc === "object" && doc && doc.path && typeof doc.content === "string")
        .map((doc) => [normalizePath(doc.path), doc.content]),
    ]);
    state.primaryMap = new Map(state.primaryDocs.map((doc) => [normalizePath(doc.path), doc]));
    state.primarySectionMap = new Map(
      state.primaryDocs.map((doc) => [normalizePath(doc.path), doc.id]),
    );
    buildDocKeyMaps();

    await Promise.all(state.primaryDocs.map((doc) => renderPrimaryDoc(doc)));
    await applyHashRoute();
  } catch (error) {
    console.error(error);
    renderLoadError("doc-constitution", "主文档加载失败。");
    renderLoadError("doc-prompts", "主文档加载失败。");
  }
}

function buildDocKeyMaps() {
  state.docKeyToPath = new Map();
  state.pathToDocKey = new Map();

  for (const path of state.allowedDocs) {
    if (state.primarySectionMap.has(path)) {
      continue;
    }

    const docKey = createDocKey(path);
    if (!docKey) {
      continue;
    }

    if (state.docKeyToPath.has(docKey)) {
      throw new Error(`Duplicate doc key: ${docKey}`);
    }

    state.docKeyToPath.set(docKey, path);
    state.pathToDocKey.set(path, docKey);
  }
}

async function loadIndex() {
  const response = await fetch("./index.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load index.json: ${response.status}`);
  }
  return response.json();
}

async function renderPrimaryDoc(doc) {
  const container = document.getElementById(`doc-${doc.id}`);
  if (!container) {
    return;
  }

  try {
    const markdown = await fetchMarkdown(doc.path);
    container.innerHTML = window.marked.parse(markdown);
    decorateArticle(container, doc.path);
  } catch (error) {
    console.error(error);
    renderLoadError(container.id, `${doc.title || "主文档"}加载失败。`);
  }
}

async function openDetail(path, section = "") {
  const normalizedPath = normalizePath(path);

  try {
    const markdown = await fetchMarkdown(normalizedPath);
    const primaryDoc = state.primaryMap.get(normalizedPath);
    const title = primaryDoc?.title || titleFromPath(normalizedPath);

    elements.detailTitle.textContent = title;
    elements.detailContent.innerHTML = window.marked.parse(markdown);
    decorateArticle(elements.detailContent, normalizedPath);

    elements.detailPanel.classList.remove("is-hidden");
    elements.page.classList.add("has-detail");
    document.body.classList.add("detail-open");
    state.currentDetailPath = normalizedPath;

    if (section) {
      requestAnimationFrame(() => {
        scrollToHeading(elements.detailContent, slugify(section));
      });
    } else {
      elements.detailContent.scrollTo({ top: 0, behavior: "auto" });
    }
  } catch (error) {
    console.error(error);
    elements.detailTitle.textContent = titleFromPath(normalizedPath);
    elements.detailContent.innerHTML = '<p class="load-error">文档加载失败。</p>';
    elements.detailPanel.classList.remove("is-hidden");
    elements.page.classList.add("has-detail");
    document.body.classList.add("detail-open");
  }
}

function closeDetail() {
  const route = getHashRoute();
  hideDetail();

  if (route.docKey) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function hideDetail() {
  elements.detailPanel.classList.add("is-hidden");
  elements.page.classList.remove("has-detail");
  document.body.classList.remove("detail-open");
  state.currentDetailPath = "";
}

async function handleDocumentClick(event) {
  const anchor = event.target.closest(".markdown-body a[href]");
  if (!anchor) {
    return;
  }

  const contextPath = anchor.closest("[data-doc-path]")?.dataset.docPath;
  const rawHref = anchor.getAttribute("href") || "";

  if (isAbsoluteLink(rawHref) || rawHref.startsWith("mailto:")) {
    anchor.target = "_blank";
    anchor.rel = "noreferrer noopener";
    return;
  }

  if (anchor.dataset.docKey) {
    event.preventDefault();
    updateHashForDetail(anchor.dataset.docKey, anchor.dataset.section || "");
    return;
  }

  if (anchor.dataset.primaryTarget) {
    event.preventDefault();
    hideDetail();
    scrollToPrimary(anchor.dataset.primaryTarget, anchor.dataset.section || "");
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${anchor.dataset.primaryTarget}`,
    );
    return;
  }

  if (rawHref.startsWith("#")) {
    event.preventDefault();
    const section = slugify(decodeURIComponent(rawHref.slice(1)));
    const container = anchor.closest(".markdown-body");
    scrollToHeading(container, section);
    return;
  }

  if (!contextPath) {
    return;
  }

  const resolved = resolveInternalTarget(rawHref, contextPath);
  if (!resolved) {
    return;
  }

  event.preventDefault();
  const docKey = state.pathToDocKey.get(resolved.path);
  if (!docKey) {
    return;
  }

  updateHashForDetail(docKey, resolved.section);
}

async function fetchMarkdown(path) {
  const normalizedPath = normalizePath(path);
  const embeddedContent = state.docContentMap.get(normalizedPath);
  if (typeof embeddedContent === "string") {
    return embeddedContent;
  }

  const response = await fetch(toAssetUrl(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.text();
}

function decorateArticle(container, currentPath) {
  container.dataset.docPath = normalizePath(currentPath);
  assignHeadingIds(container);
  normalizeLinks(container, currentPath);
}

function assignHeadingIds(container) {
  const slugCounts = new Map();
  const headings = container.querySelectorAll("h1, h2, h3, h4");

  headings.forEach((heading) => {
    const base = slugify(heading.textContent) || "section";
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    heading.id = count ? `${base}-${count + 1}` : base;
  });
}

function normalizeLinks(container, currentPath) {
  const anchors = container.querySelectorAll("a[href]");

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";

    if (isAbsoluteLink(href) || href.startsWith("mailto:")) {
      anchor.target = "_blank";
      anchor.rel = "noreferrer noopener";
      return;
    }

    if (href.startsWith("#")) {
      const section = slugify(decodeURIComponent(href.slice(1)));
      anchor.setAttribute("href", `#${section}`);
      return;
    }

    const resolved = resolveInternalTarget(href, currentPath);
    if (!resolved) {
      return;
    }

    const primaryTarget = state.primarySectionMap.get(resolved.path);
    if (primaryTarget) {
      anchor.dataset.primaryTarget = primaryTarget;
      if (resolved.section) {
        anchor.dataset.section = resolved.section;
      }
      anchor.setAttribute("href", `#${primaryTarget}`);
      return;
    }

    const docKey = state.pathToDocKey.get(resolved.path);
    if (!docKey) {
      return;
    }

    anchor.dataset.docKey = docKey;
    if (resolved.section) {
      anchor.dataset.section = resolved.section;
    }
    anchor.setAttribute("href", buildDetailHash(docKey, resolved.section));
  });
}

function resolveInternalTarget(rawHref, currentPath) {
  const [rawPath, rawSection = ""] = rawHref.split("#");
  const normalizedPath = normalizePath(rawPath);
  const currentDirectory = normalizePath(currentPath).split("/").slice(0, -1).join("/");
  const candidate = normalizedPath
    ? joinRelativePath(currentDirectory, normalizedPath)
    : normalizePath(currentPath);
  const docPath = findAllowedDoc(candidate);

  if (!docPath) {
    return null;
  }

  return {
    path: docPath,
    section: rawSection ? slugify(decodeURIComponent(rawSection)) : "",
  };
}

function findAllowedDoc(candidate) {
  const normalized = normalizePath(candidate);

  if (state.allowedDocs.has(normalized)) {
    return normalized;
  }

  if (!/\.[A-Za-z0-9]+$/.test(normalized)) {
    const asReadme = normalizePath(`${normalized.replace(/\/$/, "")}/README.md`);
    if (state.allowedDocs.has(asReadme)) {
      return asReadme;
    }
  }

  return null;
}

function scrollToHeading(container, headingId) {
  if (!container || !headingId) {
    return;
  }

  const target = container.querySelector(`#${cssEscape(headingId)}`);
  if (!target) {
    return;
  }

  const detailBody = container.closest(".detail-body");
  if (detailBody) {
    const top = target.offsetTop - 8;
    detailBody.scrollTo({ top, behavior: "smooth" });
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToPrimary(primaryTarget, section = "") {
  const wrapper = document.getElementById(primaryTarget);
  if (!wrapper) {
    return;
  }

  wrapper.scrollIntoView({ behavior: "smooth", block: "start" });

  if (!section) {
    return;
  }

  const article = wrapper.querySelector(".markdown-body");
  requestAnimationFrame(() => {
    scrollToHeading(article, section);
  });
}

function renderLoadError(containerId, message) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<p class="load-error">${escapeHtml(message)}</p>`;
  }
}

function normalizePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function joinRelativePath(baseDirectory, relativePath) {
  const parts = `${baseDirectory}/${relativePath}`.split("/");
  const stack = [];

  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      stack.pop();
      continue;
    }

    stack.push(part);
  }

  return stack.join("/");
}

function toAssetUrl(path) {
  return normalizePath(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function titleFromPath(path) {
  const normalized = normalizePath(path);
  const primaryDoc = state.primaryMap.get(normalized);
  if (primaryDoc?.title) {
    return primaryDoc.title;
  }

  const mappedTitle = state.docTitleMap.get(normalized);
  if (mappedTitle) {
    return mappedTitle;
  }

  const parts = normalized.split("/");
  const fileName = parts[parts.length - 1] || "";
  const plainName = fileName.replace(/\.md$/i, "");

  if (plainName.toLowerCase() === "readme") {
    return parts[parts.length - 2] || "README";
  }

  return plainName.replace(/^([A-Za-z]?\d+)-/, "$1 ");
}

function createDocKey(path) {
  const normalized = normalizePath(path);
  const constitutionMatch = normalized.match(/\/(P\d+)(?:\.md|-)/i);
  if (constitutionMatch) {
    return constitutionMatch[1].toUpperCase();
  }

  const promptMatch = normalized.match(/\/(\d+)(?:\.md|-)/);
  if (promptMatch) {
    return promptMatch[1];
  }

  return "";
}

function getDocPath(doc) {
  return typeof doc === "string" ? doc : doc?.path || "";
}

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function isAbsoluteLink(href) {
  return /^(https?:)?\/\//i.test(href);
}

async function applyHashRoute() {
  const route = getHashRoute();

  if (!route.docKey) {
    hideDetail();
    return;
  }

  const path = state.docKeyToPath.get(route.docKey);
  if (!path) {
    hideDetail();
    return;
  }

  if (state.currentDetailPath === path) {
    if (route.section) {
      requestAnimationFrame(() => {
        scrollToHeading(elements.detailContent, route.section);
      });
    }
    return;
  }

  await openDetail(path, route.section);
}

function getHashRoute() {
  const rawHash = window.location.hash.replace(/^#/, "");
  if (!rawHash || !rawHash.includes("=")) {
    return { docKey: "", section: "" };
  }

  const params = new URLSearchParams(rawHash);
  return {
    docKey: params.get("doc") || "",
    section: slugify(params.get("section") || ""),
  };
}

function updateHashForDetail(docKey, section = "") {
  const nextHash = buildDetailHash(docKey, section);
  if (window.location.hash === nextHash) {
    void applyHashRoute();
    return;
  }

  window.location.hash = nextHash;
}

function buildDetailHash(docKey, section = "") {
  const params = new URLSearchParams();
  params.set("doc", docKey);
  if (section) {
    params.set("section", section);
  }
  return `#${params.toString()}`;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }

  return String(value).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
