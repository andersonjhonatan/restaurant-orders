(() => {
  const dashboard = document.querySelector("#dashboard");
  const tabs = document.querySelector(".admin-tabs");
  if (!dashboard || !tabs) return;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const number = new Intl.NumberFormat("pt-BR");
  const analyticsState = { days: 30, loaded: false, data: null };

  const tab = document.createElement("button");
  tab.type = "button";
  tab.dataset.adminTab = "analytics";
  tab.textContent = "Relatórios";
  tabs.appendChild(tab);
  tabs.style.gridTemplateColumns = "repeat(4,minmax(0,1fr))";

  const panel = document.createElement("section");
  panel.id = "analyticsPanel";
  panel.className = "admin-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="analytics-heading">
      <div><span class="eyebrow"><span></span> inteligência do negócio</span><h2>Relatórios</h2><p>Acompanhe volume de pedidos, valor registrado, ticket médio e os pratos com maior saída.</p></div>
      <div class="analytics-controls">
        <label>Período<select id="analyticsPeriod"><option value="7">Últimos 7 dias</option><option value="30" selected>Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Último ano</option></select></label>
        <a id="analyticsExport" class="button button--soft" href="/api/admin/reports/orders.csv?days=30">Exportar CSV</a>
      </div>
    </div>
    <div id="analyticsLoading" class="menu-loading analytics-loading" hidden><span></span> Calculando indicadores...</div>
    <div id="analyticsContent">
      <div class="analytics-summary" aria-live="polite">
        <article><small>Pedidos</small><strong id="metricOrders">0</strong><span>registrados no período</span></article>
        <article><small>Pedidos válidos</small><strong id="metricValid">0</strong><span>sem cancelados/recusados</span></article>
        <article><small>Concluídos</small><strong id="metricCompleted">0</strong><span>finalizados</span></article>
        <article><small>Encomendas</small><strong id="metricPreorders">0</strong><span>pedidos programados</span></article>
        <article><small>Valor registrado</small><strong id="metricValue">R$ 0</strong><span>não representa conciliação bancária</span></article>
        <article><small>Ticket médio</small><strong id="metricTicket">R$ 0</strong><span>entre pedidos válidos</span></article>
      </div>
      <div class="analytics-grid">
        <article class="analytics-card"><h3>Mais vendidos</h3><p>Ranking por quantidade de itens.</p><div id="analyticsProducts" class="ranking-list"></div></article>
        <article class="analytics-card"><h3>Status dos pedidos</h3><p>Distribuição do fluxo operacional.</p><div id="analyticsStatuses" class="distribution-list"></div></article>
        <article class="analytics-card"><h3>Formas de pagamento</h3><p>Preferências dos pedidos válidos.</p><div id="analyticsPayments" class="distribution-list"></div></article>
        <article class="analytics-card analytics-card--wide"><h3>Evolução diária</h3><p>Pedidos e valor registrado por dia.</p><div id="analyticsDaily" class="daily-list"></div></article>
      </div>
      <p class="analytics-footnote">“Valor registrado” soma pedidos que não estão cancelados ou recusados. Não substitui conferência de Pix, dinheiro ou cartão.</p>
    </div>`;
  dashboard.appendChild(panel);

  const historyDialog = document.createElement("dialog");
  historyDialog.id = "orderHistoryDialog";
  historyDialog.className = "history-dialog";
  historyDialog.setAttribute("aria-labelledby", "orderHistoryTitle");
  historyDialog.innerHTML = `<div class="history-dialog__inner"><div class="history-dialog__header"><div><small>Rastreabilidade</small><h2 id="orderHistoryTitle">Histórico do pedido</h2></div><button id="closeOrderHistory" class="icon-button" type="button" aria-label="Fechar histórico">×</button></div><div id="orderHistoryTimeline" class="history-timeline"></div></div>`;
  document.body.appendChild(historyDialog);

  const refs = {
    period: document.querySelector("#analyticsPeriod"),
    export: document.querySelector("#analyticsExport"),
    loading: document.querySelector("#analyticsLoading"),
    content: document.querySelector("#analyticsContent"),
    orders: document.querySelector("#metricOrders"),
    valid: document.querySelector("#metricValid"),
    completed: document.querySelector("#metricCompleted"),
    preorders: document.querySelector("#metricPreorders"),
    value: document.querySelector("#metricValue"),
    ticket: document.querySelector("#metricTicket"),
    products: document.querySelector("#analyticsProducts"),
    statuses: document.querySelector("#analyticsStatuses"),
    payments: document.querySelector("#analyticsPayments"),
    daily: document.querySelector("#analyticsDaily"),
    historyTimeline: document.querySelector("#orderHistoryTimeline"),
    historyTitle: document.querySelector("#orderHistoryTitle"),
    historyClose: document.querySelector("#closeOrderHistory"),
  };

  async function api(path, options = {}) {
    if (typeof requestJson === "function") return requestJson(path, options);
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, headers: { "Content-Type": "application/json", "X-Admin-Request": "1", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Não foi possível carregar os dados.");
    return payload;
  }

  function barRows(items, valueKey, labelKey, formatter = (value) => number.format(value), secondary = null) {
    if (!items?.length) return '<div class="analytics-empty">Ainda não há dados neste período.</div>';
    const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);
    return items.map((item) => {
      const value = Number(item[valueKey] || 0);
      const width = Math.max(3, Math.round((value / max) * 100));
      const detail = secondary ? secondary(item) : "";
      return `<div class="distribution-row"><div class="distribution-row__copy"><strong>${esc(item[labelKey])}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}<div class="analytics-bar"><span style="width:${width}%"></span></div></div><b>${formatter(value)}</b></div>`;
    }).join("");
  }

  function render(data) {
    const summary = data.summary || {};
    refs.orders.textContent = number.format(summary.orders || 0);
    refs.valid.textContent = number.format(summary.valid_orders || 0);
    refs.completed.textContent = number.format(summary.completed || 0);
    refs.preorders.textContent = number.format(summary.preorders || 0);
    refs.value.textContent = money.format(summary.gross_value || 0);
    refs.ticket.textContent = money.format(summary.average_ticket || 0);

    const products = data.top_products || [];
    const productMax = Math.max(...products.map((item) => Number(item.quantity || 0)), 1);
    refs.products.innerHTML = products.length ? products.map((item) => `<div class="ranking-row"><div class="ranking-row__copy"><strong>${esc(item.name)}</strong><small>${money.format(item.value || 0)} em itens</small><div class="analytics-bar"><span style="width:${Math.max(3, Math.round((Number(item.quantity || 0) / productMax) * 100))}%"></span></div></div><b>${number.format(item.quantity || 0)}x</b></div>`).join("") : '<div class="analytics-empty">Ainda não há vendas neste período.</div>';

    refs.statuses.innerHTML = barRows(data.status_counts || [], "count", "status");
    refs.payments.innerHTML = barRows(data.payment_counts || [], "count", "payment_method");

    const daily = data.daily || [];
    refs.daily.innerHTML = daily.length ? [...daily].reverse().map((item) => {
      const date = new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      return `<div class="daily-row"><div class="daily-row__copy"><strong>${esc(date)}</strong><small>${number.format(item.orders || 0)} pedido(s)</small></div><b>${money.format(item.value || 0)}</b></div>`;
    }).join("") : '<div class="analytics-empty">Nenhum movimento diário neste período.</div>';
  }

  async function loadAnalytics() {
    refs.loading.hidden = false;
    refs.content.hidden = true;
    try {
      analyticsState.days = Number(refs.period.value || 30);
      refs.export.href = `/api/admin/reports/orders.csv?days=${analyticsState.days}`;
      const data = await api(`/api/admin/analytics?days=${analyticsState.days}`, { method: "GET" });
      analyticsState.data = data;
      analyticsState.loaded = true;
      render(data);
    } catch (error) {
      if (typeof showToast === "function" && error.message !== "unauthorized") showToast(error.message);
    } finally {
      refs.loading.hidden = true;
      refs.content.hidden = false;
    }
  }

  function decorateOrderHistoryButtons() {
    document.querySelectorAll("#ordersList .order-card").forEach((card) => {
      if (card.querySelector("[data-history-order]")) return;
      const actionArea = card.querySelector(".order-actions");
      const source = card.querySelector("[data-save-status], [data-approve-order], [data-reject-order]");
      if (!actionArea || !source) return;
      const id = source.dataset.saveStatus || source.dataset.approveOrder || source.dataset.rejectOrder;
      if (!id) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button--ghost history-button";
      button.dataset.historyOrder = id;
      button.textContent = "Histórico";
      actionArea.appendChild(button);
    });
  }

  async function openHistory(orderId) {
    refs.historyTitle.textContent = `Histórico · Pedido #${orderId}`;
    refs.historyTimeline.innerHTML = '<div class="menu-loading"><span></span> Carregando histórico...</div>';
    historyDialog.showModal();
    try {
      const result = await api(`/api/admin/orders/${orderId}/history`, { method: "GET" });
      const history = result.history || [];
      refs.historyTimeline.innerHTML = history.length ? history.map((item) => {
        const when = item.changed_at ? new Date(item.changed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Data não registrada";
        const from = item.old_status ? `De ${item.old_status} para ` : "Status ";
        return `<div class="history-entry"><strong>${esc(item.new_status || "Sem status")}</strong><small>${esc(when)}</small><span>${esc(from)}${esc(item.new_status || "")} · ${esc(item.source || "sistema")}</span></div>`;
      }).join("") : '<div class="analytics-empty">Nenhum evento registrado para este pedido.</div>';
    } catch (error) {
      refs.historyTimeline.innerHTML = `<div class="analytics-empty">${esc(error.message)}</div>`;
    }
  }

  const previousSetTab = typeof setAdminTab === "function" ? setAdminTab : null;
  if (previousSetTab) {
    setAdminTab = function(nextTab) {
      previousSetTab(nextTab);
      panel.hidden = nextTab !== "analytics";
      if (nextTab === "analytics") {
        const refresh = document.querySelector("#refreshOrders");
        if (refresh) refresh.textContent = "Atualizar relatório";
        if (!analyticsState.loaded) loadAnalytics();
      }
    };
  }

  tab.addEventListener("click", () => setAdminTab("analytics"));
  refs.period.addEventListener("change", loadAnalytics);
  document.querySelector("#refreshOrders")?.addEventListener("click", (event) => {
    if (typeof state !== "undefined" && state.activeTab === "analytics") {
      event.stopImmediatePropagation();
      loadAnalytics();
    }
  }, true);

  document.querySelector("#ordersList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-order]");
    if (button) openHistory(Number(button.dataset.historyOrder));
  });
  refs.historyClose.addEventListener("click", () => historyDialog.close());
  historyDialog.addEventListener("click", (event) => { if (event.target === historyDialog) historyDialog.close(); });

  const ordersRoot = document.querySelector("#ordersList");
  if (ordersRoot) {
    new MutationObserver(decorateOrderHistoryButtons).observe(ordersRoot, { childList: true, subtree: true });
    decorateOrderHistoryButtons();
  }
})();