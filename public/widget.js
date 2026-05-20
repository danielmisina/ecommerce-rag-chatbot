(function () {
  const script = document.currentScript;
  const widgetKey = script.dataset.widgetKey;
  const apiBase = new URL(script.src).origin;

  if (!widgetKey) {
    console.error("[ChatWidget] Missing data-widget-key attribute.");
    return;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const style = document.createElement("style");
  style.textContent = `
    #cw-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #cw-root { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }

    #cw-btn {
      width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      box-shadow: 0 4px 16px rgba(102,126,234,0.5);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #cw-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(102,126,234,0.6); }
    #cw-btn svg { width: 20px; height: 20px; fill: #fff; }

    #cw-panel {
      width: 340px; height: 480px; background: #fff; border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2); display: none; flex-direction: column; overflow: hidden;
    }
    #cw-panel.open { display: flex; }

    #cw-header {
      padding: 14px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff; font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;
    }
    #cw-header span { flex: 1; }
    #cw-header button { background: none; border: none; color: rgba(255,255,255,0.8); cursor: pointer; font-size: 1.1rem; padding: 0; }
    #cw-header button:hover { color: #fff; }

    #cw-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }

    .cw-msg { max-width: 85%; padding: 10px 13px; border-radius: 12px; font-size: 0.875rem; line-height: 1.45; word-wrap: break-word; }
    .cw-msg.user { align-self: flex-end; background: #2563eb; color: #fff; border-radius: 14px 14px 3px 14px; }
    .cw-msg.bot  { align-self: flex-start; background: #f3f4f6; color: #1f2937; border-radius: 14px 14px 14px 3px; }
    .cw-msg.err  { align-self: flex-start; background: #fee2e2; color: #991b1b; border-radius: 14px 14px 14px 3px; }

    .cw-products { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
    .cw-product  { background: #dbeafe; border-radius: 6px; padding: 5px 8px; font-size: 0.8rem; }

    .cw-typing { display: flex; gap: 4px; align-items: center; padding: 10px 13px; background: #f3f4f6; border-radius: 14px 14px 14px 3px; align-self: flex-start; }
    .cw-dot { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; animation: cw-bounce 1.2s infinite; }
    .cw-dot:nth-child(2) { animation-delay: 0.2s; }
    .cw-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cw-bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }

    #cw-form { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
    #cw-input { flex: 1; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.875rem; outline: none; }
    #cw-input:focus { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.15); }
    #cw-send { padding: 9px 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 0.875rem; font-weight: 500; transition: opacity 0.2s; }
    #cw-send:disabled { opacity: 0.5; cursor: not-allowed; }

    .cw-empty { color: #9ca3af; font-size: 0.85rem; text-align: center; margin: auto; padding: 24px; }
  `;
  document.head.appendChild(style);

  // ── HTML ──────────────────────────────────────────────────────────────────

  const root = document.createElement("div");
  root.id = "cw-root";
  root.innerHTML = `
    <div id="cw-panel">
      <div id="cw-header">
        <svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
        <span>Product Assistant</span>
        <button id="cw-close" title="Close">✕</button>
      </div>
      <div id="cw-messages">
        <div class="cw-empty">Ask about products, prices, or features!</div>
      </div>
      <form id="cw-form">
        <input id="cw-input" type="text" placeholder="Ask something…" autocomplete="off" />
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
  const input    = document.getElementById("cw-input");
  const send     = document.getElementById("cw-send");
  let   firstMsg = true;

  document.getElementById("cw-btn").addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) input.focus();
  });

  document.getElementById("cw-close").addEventListener("click", () => {
    panel.classList.remove("open");
  });

  document.getElementById("cw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    if (firstMsg) { messages.innerHTML = ""; firstMsg = false; }

    addMsg(text, "user");
    input.value = "";
    send.disabled = true;

    const typing = document.createElement("div");
    typing.className = "cw-typing";
    typing.innerHTML = '<div class="cw-dot"></div><div class="cw-dot"></div><div class="cw-dot"></div>';
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await fetch(`${apiBase}/widget/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Widget-Key": widgetKey },
        body: JSON.stringify({ message: text }),
      });
      typing.remove();
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      addBotMsg(data.answer, data.recommendedProducts || []);
    } catch (err) {
      typing.remove();
      addMsg("Sorry, something went wrong. Please try again.", "err");
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  function addMsg(text, type) {
    const div = document.createElement("div");
    div.className = `cw-msg ${type}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function addBotMsg(answer, products) {
    const div = document.createElement("div");
    div.className = "cw-msg bot";
    div.textContent = answer;
    if (products.length > 0) {
      const list = document.createElement("div");
      list.className = "cw-products";
      products.forEach((p) => {
        const item = document.createElement("div");
        item.className = "cw-product";
        item.textContent = `${p.title} — $${Number(p.price).toFixed(2)}`;
        list.appendChild(item);
      });
      div.appendChild(list);
    }
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }
})();
