(() => {
  const inventoryState = {
    items: [],
    movements: [],
    products: [],
    loaded: false,
    activeIngredient: "",
    activeRecipe: "",
  };

  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const refs = {
    panel: q("#inventoryPanel"),
    loading: q("#inventoryLoading"),
    list: q("#inventoryList"),
    empty: q("#inventoryEmpty"),
    search: q("#inventorySearch"),
    total: q("#inventoryTotal"),
    low: q("#inventoryLow"),
    unavailable: q("#inventoryUnavailable"),
    movements: q("#inventoryMovements"),
    recipes: q("#inventoryRecipes"),
    adjustDialog: q("#inventoryAdjustDialog"),
    adjustForm: q("#inventoryAdjustForm"),
    adjustTitle: q("#inventoryAdjustTitle"),
    adjustIngredient: q("#inventoryAdjustIngredient"),
    adjustDelta: q("#inventoryAdjustDelta"),
    adjustReason: q("#inventoryAdjustReason"),
    adjustNote: q("#inventoryAdjustNote"),
    adjustError: q("#inventoryAdjustError"),
    adjustClose: q("#closeInventoryAdjust"),
    adjustCancel: q("#cancelInventoryAdjust"),
    adjustSave: q("#saveInventoryAdjust"),
    recipeDialog: q("#recipeDialog"),
    recipeForm: q("#recipeForm"),
    recipeTitle: q("#recipeTitle"),
    recipeRows: q("#recipeRows"),
    recipeFactors: q("#recipeFactors"),
    recipeError: q("#recipeError"),
    recipeClose: q("#closeRecipeDialog"),
    recipeCancel: q("#cancelRecipeDialog"),
    recipeSave: q("#saveRecipe"),
    addRecipeItem: q("#addRecipeItem"),
  };

  if (!refs.panel) return;

  const tabs = q(".admin-tabs");
  if (tabs) tabs.style.gridTemplateColumns = "repeat(3,minmax(0,1fr))";

  function notify(message) {
    if (typeof showToast === "function") showToast(message);
  }

  async function api(path, options = {}) {
    if (typeof requestJson === "function") return requestJson(path, options);
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { "Content-Type": "application/json", "X-Admin-Request": "1", ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Não foi possível concluir a operação.");
    return payload;
  }

  function filteredItems() {
    const term = refs.search.value.trim().toLocaleLowerCase("pt-BR");
    if (!term) return inventoryState.items;
    return inventoryState.items.filter((item) => item.ingredient.toLocaleLowerCase("pt-BR").includes(term));
  }

  function stockPercent(item) {
    const initial = Math.max(Number(item.initial_amount || 0), Number(item.available_amount || 0), 1);
    return Math.max(0, Math.min(100, Math.round((Number(item.available_amount || 0) / initial) * 100)));
  }

  function renderInventory() {
    refs.total.textContent = inventoryState.items.length;
    refs.low.textContent = inventoryState.items.filter((item) => Number(item.available_amount) <= Number(item.low_stock_threshold)).length;
    refs.unavailable.textContent = inventoryState.items.filter((item) => Number(item.available_amount) <= 0).length;
    refs.list.innerHTML = "";

    const items = filteredItems();
    refs.empty.hidden = items.length > 0;
    for (const item of items) {
      const available = Number(item.available_amount || 0);
      const threshold = Number(item.low_stock_threshold || 0);
      const low = available <= threshold;
      const empty = available <= 0;
      const article = document.createElement("article");
      article.className = `inventory-card${low ? " is-low" : ""}${empty ? " is-empty" : ""}`;
      article.dataset.ingredient = item.ingredient;
      article.innerHTML = `
        <div class="inventory-card__top">
          <div><h3>${esc(item.ingredient)}</h3><div class="inventory-card__meta"><span>${empty ? "Sem estoque" : low ? "Estoque baixo" : "Estoque normal"}</span><span>Alerta em ${threshold}</span></div></div>
          <div class="inventory-stock"><strong>${available}</strong><small>unidades de controle</small></div>
        </div>
        <div class="inventory-card__bar" aria-hidden="true"><span style="width:${stockPercent(item)}%"></span></div>
        <div class="inventory-card__actions">
          <button type="button" class="button button--soft" data-adjust-stock="${encodeURIComponent(item.ingredient)}">Ajustar estoque</button>
          <label class="inventory-threshold"><input type="number" min="0" max="100000" value="${threshold}" data-threshold-input="${encodeURIComponent(item.ingredient)}" aria-label="Alerta de estoque baixo para ${esc(item.ingredient)}" /><button class="button button--ghost" type="button" data-save-threshold="${encodeURIComponent(item.ingredient)}">Salvar alerta</button></label>
        </div>`;
      refs.list.appendChild(article);
    }

    refs.movements.innerHTML = inventoryState.movements.length
      ? inventoryState.movements.map((movement) => {
          const delta = Number(movement.delta || 0);
          const date = movement.created_at ? new Date(movement.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
          return `<div class="movement-row"><div><strong>${esc(movement.ingredient)} · ${esc(movement.reason)}</strong><small>${date}${movement.note ? ` · ${esc(movement.note)}` : ""} · saldo ${Number(movement.balance_after || 0)}</small></div><b class="${delta < 0 ? "is-negative" : ""}">${delta > 0 ? "+" : ""}${delta}</b></div>`;
        }).join("")
      : '<div class="menu-empty">Nenhuma movimentação manual registrada ainda.</div>';

    refs.recipes.innerHTML = inventoryState.products.length
      ? inventoryState.products.map((product) => `<article class="recipe-product"><div><strong>${esc(product.display_name)}</strong><small>${product.active ? "Ativo" : "Inativo"} · ${(product.options || []).length} opção(ões)</small></div><button type="button" class="button button--soft" data-edit-recipe="${encodeURIComponent(product.dish_name)}">Receita de estoque</button></article>`).join("")
      : '<div class="menu-empty">Carregue o cardápio para configurar receitas.</div>';
  }

  async function loadInventory() {
    refs.loading.hidden = false;
    try {
      const [inventory, products] = await Promise.all([
        api("/api/admin/inventory", { method: "GET" }),
        api("/api/admin/products", { method: "GET" }),
      ]);
      inventoryState.items = inventory.items || [];
      inventoryState.movements = inventory.movements || [];
      inventoryState.products = products.products || [];
      inventoryState.loaded = true;
      renderInventory();
    } catch (error) {
      if (error.message !== "unauthorized") notify(error.message);
    } finally {
      refs.loading.hidden = true;
    }
  }

  function openAdjust(ingredient) {
    const item = inventoryState.items.find((current) => current.ingredient === ingredient);
    if (!item) return;
    inventoryState.activeIngredient = ingredient;
    refs.adjustTitle.textContent = `Ajustar ${ingredient}`;
    refs.adjustIngredient.value = ingredient;
    refs.adjustDelta.value = "";
    refs.adjustReason.value = "Reposição";
    refs.adjustNote.value = "";
    refs.adjustError.hidden = true;
    refs.adjustDialog.showModal();
    requestAnimationFrame(() => refs.adjustDelta.focus());
  }

  function closeAdjust() {
    if (refs.adjustDialog.open) refs.adjustDialog.close();
    inventoryState.activeIngredient = "";
  }

  async function saveAdjustment(event) {
    event.preventDefault();
    const delta = Number(refs.adjustDelta.value);
    if (!Number.isInteger(delta) || delta === 0) {
      refs.adjustError.textContent = "Informe uma quantidade inteira diferente de zero.";
      refs.adjustError.hidden = false;
      return;
    }
    refs.adjustSave.disabled = true;
    refs.adjustError.hidden = true;
    try {
      await api("/api/admin/inventory/adjust", {
        method: "POST",
        body: JSON.stringify({ ingredient: refs.adjustIngredient.value, delta, reason: refs.adjustReason.value, note: refs.adjustNote.value.trim() }),
      });
      closeAdjust();
      await loadInventory();
      notify("Estoque atualizado e movimentação registrada");
    } catch (error) {
      refs.adjustError.textContent = error.message;
      refs.adjustError.hidden = false;
    } finally {
      refs.adjustSave.disabled = false;
    }
  }

  async function saveThreshold(ingredient, input) {
    const threshold = Number(input.value);
    if (!Number.isInteger(threshold) || threshold < 0) return notify("Informe um alerta de estoque válido.");
    try {
      const result = await api(`/api/admin/inventory/${encodeURIComponent(ingredient)}/threshold`, {
        method: "PATCH",
        body: JSON.stringify({ threshold }),
      });
      const index = inventoryState.items.findIndex((item) => item.ingredient === ingredient);
      if (index >= 0) inventoryState.items[index] = result.item;
      renderInventory();
      notify("Alerta de estoque atualizado");
    } catch (error) {
      notify(error.message);
    }
  }

  function ingredientOptions(selected = "") {
    return inventoryState.items.map((item) => `<option value="${esc(item.ingredient)}" ${item.ingredient === selected ? "selected" : ""}>${esc(item.ingredient)} · saldo ${Number(item.available_amount || 0)}</option>`).join("");
  }

  function addRecipeRow(ingredient = "", amount = "") {
    const row = document.createElement("div");
    row.className = "recipe-row";
    row.innerHTML = `<label class="form-field">Ingrediente<select data-recipe-ingredient required>${ingredientOptions(ingredient)}</select></label><label class="form-field">Consumo<input data-recipe-amount type="number" min="1" max="100000" step="1" required value="${amount}" /></label><button type="button" data-remove-recipe aria-label="Remover ingrediente">×</button>`;
    refs.recipeRows.appendChild(row);
  }

  async function openRecipe(dishName) {
    const product = inventoryState.products.find((item) => item.dish_name === dishName);
    if (!product) return;
    inventoryState.activeRecipe = dishName;
    refs.recipeTitle.textContent = `Receita · ${product.display_name}`;
    refs.recipeRows.innerHTML = "";
    refs.recipeFactors.innerHTML = "";
    refs.recipeError.hidden = true;
    try {
      const result = await api(`/api/admin/products/${encodeURIComponent(dishName)}/recipe`, { method: "GET" });
      const entries = Object.entries(result.recipe || {});
      if (entries.length) entries.forEach(([ingredient, amount]) => addRecipeRow(ingredient, amount));
      else addRecipeRow();

      const factors = result.option_factors || {};
      refs.recipeFactors.innerHTML = (product.options || []).map((option) => `<label class="recipe-factor-row"><span>${esc(option.label)}<small>Multiplicador de consumo</small></span><input type="number" min="1" max="50" step="1" value="${Number(factors[option.id] || 1)}" data-factor-id="${esc(option.id)}" aria-label="Multiplicador de ${esc(option.label)}" /></label>`).join("");
      refs.recipeDialog.showModal();
    } catch (error) {
      notify(error.message);
    }
  }

  function closeRecipe() {
    if (refs.recipeDialog.open) refs.recipeDialog.close();
    inventoryState.activeRecipe = "";
  }

  async function saveRecipe(event) {
    event.preventDefault();
    const rows = qa("#recipeRows .recipe-row");
    const map = new Map();
    for (const row of rows) {
      const ingredient = row.querySelector("[data-recipe-ingredient]").value;
      const amount = Number(row.querySelector("[data-recipe-amount]").value);
      if (!ingredient || !Number.isInteger(amount) || amount < 1) {
        refs.recipeError.textContent = "Revise os ingredientes e as quantidades da receita.";
        refs.recipeError.hidden = false;
        return;
      }
      map.set(ingredient, (map.get(ingredient) || 0) + amount);
    }
    if (!map.size) {
      refs.recipeError.textContent = "Cadastre pelo menos um ingrediente.";
      refs.recipeError.hidden = false;
      return;
    }
    const factors = {};
    qa("#recipeFactors [data-factor-id]").forEach((input) => { factors[input.dataset.factorId] = Math.max(1, Number(input.value || 1)); });

    refs.recipeSave.disabled = true;
    refs.recipeError.hidden = true;
    try {
      await api(`/api/admin/products/${encodeURIComponent(inventoryState.activeRecipe)}/recipe`, {
        method: "PUT",
        body: JSON.stringify({ items: [...map.entries()].map(([ingredient, amount]) => ({ ingredient, amount })), option_factors: factors }),
      });
      closeRecipe();
      notify("Receita de estoque salva. O prato já pode ser ativado.");
    } catch (error) {
      refs.recipeError.textContent = error.message;
      refs.recipeError.hidden = false;
    } finally {
      refs.recipeSave.disabled = false;
    }
  }

  function decorateProductCards() {
    document.querySelectorAll("#productsList .catalog-card").forEach((card) => {
      if (card.querySelector("[data-p2-recipe-button]")) return;
      const actions = card.querySelector(".catalog-card__actions");
      const dishName = card.dataset.productName;
      if (!actions || !dishName) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button--soft";
      button.dataset.p2RecipeButton = dishName;
      button.textContent = "Receita";
      actions.insertBefore(button, actions.querySelector("[data-toggle-product]") || null);
    });
  }

  const originalSetTab = typeof setAdminTab === "function" ? setAdminTab : null;
  if (originalSetTab) {
    setAdminTab = function(tab) {
      originalSetTab(tab);
      refs.panel.hidden = tab !== "inventory";
      if (tab === "inventory") {
        const refresh = q("#refreshOrders");
        if (refresh) refresh.textContent = "Atualizar estoque";
        loadInventory();
      }
    };
  }

  q("#refreshOrders")?.addEventListener("click", (event) => {
    if (typeof state !== "undefined" && state.activeTab === "inventory") {
      event.stopImmediatePropagation();
      loadInventory();
    }
  }, true);

  refs.search.addEventListener("input", renderInventory);
  refs.list.addEventListener("click", (event) => {
    const adjust = event.target.closest("[data-adjust-stock]");
    if (adjust) return openAdjust(decodeURIComponent(adjust.dataset.adjustStock));
    const threshold = event.target.closest("[data-save-threshold]");
    if (threshold) {
      const ingredient = decodeURIComponent(threshold.dataset.saveThreshold);
      const input = refs.list.querySelector(`[data-threshold-input="${CSS.escape(encodeURIComponent(ingredient))}"]`);
      if (input) saveThreshold(ingredient, input);
    }
  });
  refs.recipes.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-recipe]");
    if (button) openRecipe(decodeURIComponent(button.dataset.editRecipe));
  });
  q("#productsList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-p2-recipe-button]");
    if (!button) return;
    event.preventDefault();
    if (!inventoryState.products.length) loadInventory().then(() => openRecipe(button.dataset.p2RecipeButton));
    else openRecipe(button.dataset.p2RecipeButton);
  });

  const productObserver = new MutationObserver(decorateProductCards);
  const productsRoot = q("#productsList");
  if (productsRoot) productObserver.observe(productsRoot, { childList: true });
  decorateProductCards();

  refs.adjustForm.addEventListener("submit", saveAdjustment);
  refs.adjustClose.addEventListener("click", closeAdjust);
  refs.adjustCancel.addEventListener("click", closeAdjust);
  refs.adjustDialog.addEventListener("click", (event) => { if (event.target === refs.adjustDialog) closeAdjust(); });

  refs.recipeForm.addEventListener("submit", saveRecipe);
  refs.recipeClose.addEventListener("click", closeRecipe);
  refs.recipeCancel.addEventListener("click", closeRecipe);
  refs.addRecipeItem.addEventListener("click", () => addRecipeRow());
  refs.recipeRows.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-recipe]");
    if (!remove) return;
    const rows = refs.recipeRows.querySelectorAll(".recipe-row");
    if (rows.length <= 1) return notify("A receita precisa ter pelo menos um ingrediente.");
    remove.closest(".recipe-row").remove();
  });
  refs.recipeDialog.addEventListener("click", (event) => { if (event.target === refs.recipeDialog) closeRecipe(); });
})();