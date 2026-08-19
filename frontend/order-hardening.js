(() => {
  const originalFetch = window.fetch.bind(window);
  let pendingBody = sessionStorage.getItem("sabor-da-casa-pending-order-body") || "";
  let pendingKey = sessionStorage.getItem("sabor-da-casa-pending-order-key") || "";

  function newKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const random = Math.random().toString(36).slice(2);
    return `order-${Date.now()}-${random}`;
  }

  window.fetch = async function hardenedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();

    if (url !== "/api/orders" || method !== "POST") {
      return originalFetch(input, init);
    }

    const body = typeof init.body === "string" ? init.body : "";
    if (!pendingKey || pendingBody !== body) {
      pendingBody = body;
      pendingKey = newKey();
      sessionStorage.setItem("sabor-da-casa-pending-order-body", pendingBody);
      sessionStorage.setItem("sabor-da-casa-pending-order-key", pendingKey);
    }

    const headers = new Headers(init.headers || {});
    headers.set("Idempotency-Key", pendingKey);

    const response = await originalFetch(input, { ...init, headers });
    if (response.ok) {
      pendingBody = "";
      pendingKey = "";
      sessionStorage.removeItem("sabor-da-casa-pending-order-body");
      sessionStorage.removeItem("sabor-da-casa-pending-order-key");
    }
    return response;
  };
})();
