(function () {
  const script = document.currentScript;
  const widgetKey = script.dataset.widgetKey;
  const apiBase = new URL(script.src).origin;

  if (!widgetKey) {
    console.error("[ChatWidget] Missing data-widget-key attribute.");
    return;
  }

  const EMOJI = { swim: "🏊", bike: "🚴", run: "🏃", nutrition: "🍌", gear: "⌚" };

  // ── Styles ────────────────────────────────────────────────────────────────

  const style = document.createElement("style");
  style.textContent = `
    #cw-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #cw-root {
      --cw-primary:    #2563eb;
      --cw-primary-dk: #1d4ed8;
      --cw-btn-bg:     linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
    }

    #cw-btn {
      width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
      background: var(--cw-btn-bg);
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #cw-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
    #cw-btn svg { width: 20px; height: 20px; }

    #cw-panel {
      width: 340px; height: 520px; background: #fff; border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2); display: none; flex-direction: column; overflow: hidden;
    }
    #cw-panel.open { display: flex; }

    #cw-header {
      padding: 14px 16px; border-bottom: 1px solid #e5e7eb; background: #f9fafb;
      display: flex; align-items: center; gap: 8px;
    }
    #cw-header-text { flex: 1; }
    #cw-title { font-size: 0.95rem; font-weight: 600; color: #1f2937; }
    #cw-subtitle { font-size: 0.75rem; color: #6b7280; margin-top: 1px; }
    #cw-back { display: none; background: none; border: none; cursor: pointer; color: #6b7280; font-size: 1rem; padding: 0 4px 0 0; line-height: 1; }
    #cw-back:hover { color: #1f2937; }
    #cw-close { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 1.1rem; padding: 0; line-height: 1; }
    #cw-close:hover { color: #1f2937; }

    #cw-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }

    .cw-msg-row { display: flex; animation: cw-slide-in 0.25s ease-out; }
    .cw-msg-row.user { justify-content: flex-end; }
    @keyframes cw-slide-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    .cw-bubble { max-width: 82%; padding: 10px 14px; border-radius: 12px; font-size: 0.875rem; line-height: 1.45; word-wrap: break-word; }
    .cw-msg-row.user .cw-bubble { background: var(--cw-primary); color: #fff; border-radius: 18px 18px 4px 18px; }
    .cw-msg-row.bot  .cw-bubble { background: #e5e7eb; color: #1f2937; border-radius: 18px 18px 18px 4px; font-size: 0.9rem; }
    .cw-msg-row.err  .cw-bubble { background: #fee2e2; color: #991b1b; border-radius: 18px 18px 18px 4px; }

    .cw-products { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
    .cw-product { background: #dbeafe; border-radius: 8px; padding: 7px 10px; font-size: 0.82rem; cursor: pointer; color: var(--cw-primary); transition: background 0.15s; }
    .cw-product:hover { background: #bfdbfe; }

    .cw-loading-row { display: flex; animation: cw-slide-in 0.25s ease-out; }
    .cw-loading-bubble { background: #e5e7eb; border-radius: 18px 18px 18px 4px; padding: 10px 14px; display: flex; align-items: center; gap: 8px; font-size: 0.875rem; color: #6b7280; }
    .cw-spinner { width: 12px; height: 12px; border: 2px solid #d1d5db; border-top-color: var(--cw-primary); border-radius: 50%; animation: cw-spin 0.8s linear infinite; flex-shrink: 0; }
    @keyframes cw-spin { to { transform: rotate(360deg); } }

    #cw-form { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
    #cw-input { flex: 1; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.875rem; outline: none; font-family: inherit; }
    #cw-input:focus { border-color: var(--cw-primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    #cw-send { padding: 9px 14px; background: var(--cw-primary); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 0.875rem; font-weight: 500; transition: background 0.2s; }
    #cw-send:hover:not(:disabled) { background: var(--cw-primary-dk); }
    #cw-send:disabled { background: #94a3b8; cursor: not-allowed; }

    .cw-empty { color: #9ca3af; font-size: 0.85rem; text-align: center; margin: auto; padding: 24px; }

    #cw-detail { flex: 1; overflow-y: auto; padding: 14px; display: none; flex-direction: column; gap: 10px; }
    .cw-det-img { font-size: 3rem; background: #f3f4f6; border-radius: 10px; padding: 14px; text-align: center; }
    .cw-det-cat { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--cw-primary); }
    .cw-det-title { font-size: 1rem; font-weight: 700; line-height: 1.3; color: #1f2937; margin-top: 2px; }
    .cw-det-brand { font-size: 0.8rem; color: #9ca3af; }
    .cw-det-price { font-size: 1.3rem; font-weight: 800; color: #1f2937; }
    .cw-det-rating { font-size: 0.8rem; color: #f59e0b; }
    .cw-det-instock { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: #d1fae5; color: #065f46; }
    .cw-det-oos     { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: #fee2e2; color: #991b1b; }
    .cw-det-desc { font-size: 0.82rem; line-height: 1.65; color: #374151; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
    .cw-det-link { display: block; text-align: center; padding: 9px 14px; background: var(--cw-primary); color: #fff !important; border-radius: 8px; text-decoration: none !important; font-size: 0.875rem; font-weight: 500; transition: background 0.2s; }
    .cw-det-link:hover { background: var(--cw-primary-dk); }
  `;
  document.head.appendChild(style);

  // ── HTML ──────────────────────────────────────────────────────────────────

  const root = document.createElement("div");
  root.id = "cw-root";
  root.innerHTML = `
    <div id="cw-panel">
      <div id="cw-header">
        <button id="cw-back" title="Back">←</button>
        <div id="cw-header-text">
          <div id="cw-title">🛍️ Product Assistant</div>
          <div id="cw-subtitle">Ask about products, prices, or features</div>
        </div>
        <button id="cw-close" title="Close">✕</button>
      </div>
      <div id="cw-messages">
        <div class="cw-empty">Start a conversation</div>
      </div>
      <div id="cw-detail"></div>
      <form id="cw-form">
        <input id="cw-input" type="text" placeholder="Ask for products…" autocomplete="off" />
        <button id="cw-send" type="submit">Send</button>
      </form>
    </div>
    <button id="cw-btn" title="Chat with us">
      <svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path fill="white" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
    </button>
  `;
  document.body.appendChild(root);

  // ── Logic ─────────────────────────────────────────────────────────────────

  const panel    = document.getElementById("cw-panel");
  const messages = document.getElementById("cw-messages");
  const detail   = document.getElementById("cw-detail");
  const back     = document.getElementById("cw-back");
  const form     = document.getElementById("cw-form");
  const input    = document.getElementById("cw-input");
  const send     = document.getElementById("cw-send");
  let   firstMsg = true;

  // ── Config (non-blocking) ─────────────────────────────────────────────────

  fetch(`${apiBase}/widget/config`, { headers: { "X-Widget-Key": widgetKey } })
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d?.settings) applySettings(d.settings); })
    .catch(() => {});

  function applySettings(s) {
    if (s.primaryColor) {
      root.style.setProperty("--cw-primary", s.primaryColor);
      root.style.setProperty("--cw-primary-dk", darkenHex(s.primaryColor, 25));
    }
    if (s.buttonColor) root.style.setProperty("--cw-btn-bg", s.buttonColor);
    if (s.title)    document.getElementById("cw-title").textContent    = s.title;
    if (s.subtitle) document.getElementById("cw-subtitle").textContent = s.subtitle;
    if (s.position === "bottom-left") {
      root.style.right = "auto";
      root.style.left  = "24px";
      root.style.alignItems = "flex-start";
    }
  }

  function darkenHex(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    return "#" + [n >> 16, (n >> 8) & 0xff, n & 0xff]
      .map(c => Math.max(0, c - amt).toString(16).padStart(2, "0"))
      .join("");
  }

  // ── Events ────────────────────────────────────────────────────────────────

  document.getElementById("cw-btn").addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) input.focus();
  });

  document.getElementById("cw-close").addEventListener("click", () => {
    panel.classList.remove("open");
  });

  back.addEventListener("click", () => {
    detail.style.display = "none";
    back.style.display = "none";
    messages.style.display = "flex";
    form.style.display = "flex";
    input.focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    if (firstMsg) { messages.innerHTML = ""; firstMsg = false; }

    addMsg(text, "user");
    input.value = "";
    send.disabled = true;

    const loading = document.createElement("div");
    loading.className = "cw-loading-row";
    loading.innerHTML = '<div class="cw-loading-bubble"><div class="cw-spinner"></div> Thinking…</div>';
    messages.appendChild(loading);
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await fetch(`${apiBase}/widget/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Widget-Key": widgetKey },
        body: JSON.stringify({ message: text }),
      });
      loading.remove();
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      addBotMsg(data.answer, data.recommendedProducts || []);
    } catch (err) {
      loading.remove();
      addMsg("Sorry, something went wrong. Please try again.", "err");
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  function addMsg(text, type) {
    const row = document.createElement("div");
    row.className = `cw-msg-row ${type}`;
    const bubble = document.createElement("div");
    bubble.className = "cw-bubble";
    bubble.textContent = text;
    row.appendChild(bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function addBotMsg(answer, products) {
    const row = document.createElement("div");
    row.className = "cw-msg-row bot";
    const bubble = document.createElement("div");
    bubble.className = "cw-bubble";
    bubble.textContent = answer;
    if (products.length > 0) {
      const list = document.createElement("div");
      list.className = "cw-products";
      products.forEach((p) => {
        const item = document.createElement("div");
        item.className = "cw-product";
        item.textContent = `${p.title} — $${Number(p.price).toFixed(2)}`;
        item.addEventListener("click", () => showProductDetail(p));
        list.appendChild(item);
      });
      bubble.appendChild(list);
    }
    row.appendChild(bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function showProductDetail(p) {
    const stars = "★".repeat(Math.round(p.rating || 0));
    detail.innerHTML = `
      <div class="cw-det-img">${EMOJI[p.category] || "📦"}</div>
      <div>
        <div class="cw-det-cat">${p.category || ""}</div>
        <div class="cw-det-title">${p.title}</div>
        <div class="cw-det-brand">${p.brand || ""}</div>
      </div>
      <div>
        <div class="cw-det-price">$${Number(p.price).toFixed(2)}</div>
        <div class="cw-det-rating">${stars} ${p.rating || ""}</div>
      </div>
      <span class="${p.inStock ? "cw-det-instock" : "cw-det-oos"}">${p.inStock ? "In stock" : "Out of stock"}</span>
      ${p.description ? `<div class="cw-det-desc">${p.description}</div>` : ""}
      ${p.url ? `<a class="cw-det-link" href="${p.url}" target="_blank" rel="noopener noreferrer">View in store →</a>` : ""}
    `;
    messages.style.display = "none";
    form.style.display = "none";
    detail.style.display = "flex";
    back.style.display = "";
    detail.scrollTop = 0;
  }
})();
