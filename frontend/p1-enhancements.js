(() => {
  const FAVORITES_KEY = "sabor-da-casa-favorites-v1";
  const cartDrawer = document.querySelector("#cartDrawer");
  const appFrame = document.querySelector(".app-frame");
  const bottomNav = document.querySelector(".bottom-nav");
  const mobileCartBar = document.querySelector("#mobileCartBar");
  const productDialog = document.querySelector("#productDialog");
  const checkoutDialog = document.querySelector("#checkoutDialog");
  const favoriteButton = document.querySelector(".product-detail__favorite");
  const menuLoading = document.querySelector("#menuLoading");
  const menuGrid = document.querySelector("#menuGrid");

  let cartReturnFocus = null;
  const dialogReturnFocus = new WeakMap();
  let diagnosingMenu = false;

  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function safeFavorites() {
    try {
      return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"));
    } catch (_error) {
      return new Set();
    }
  }

  function updateFavoriteState() {
    if (!favoriteButton) return;
    const dishName = typeof state !== "undefined" ? state.selectedDish?.dish_name : "";
    const selected = Boolean(dishName && safeFavorites().has(dishName));
    favoriteButton.setAttribute("aria-pressed", selected ? "true" : "false");
    favoriteButton.setAttribute(
      "aria-label",
      selected ? "Remover prato dos favoritos" : "Adicionar prato aos favoritos",
    );
  }

  function toggleFavorite() {
    if (!favoriteButton || typeof state === "undefined" || !state.selectedDish) return;
    const favorites = safeFavorites();
    const dishName = state.selectedDish.dish_name;
    const label = state.selectedDish.display_name || dishName;
    if (favorites.has(dishName)) {
      favorites.delete(dishName);
      if (typeof showToast === "function") showToast(`${label} removido dos favoritos`);
    } else {
      favorites.add(dishName);
      if (typeof showToast === "function") showToast(`${label} salvo nos favoritos`);
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    updateFavoriteState();
  }

  function setCartBackgroundInert(active) {
    [appFrame, bottomNav, mobileCartBar].forEach((element) => {
      if (!element) return;
      element.inert = active;
      if (active) element.setAttribute("aria-hidden", "true");
      else element.removeAttribute("aria-hidden");
    });
  }

  function focusablesWithin(element) {
    return [...element.querySelectorAll(focusableSelector)].filter((item) => {
      return !item.hidden && item.getAttribute("aria-hidden") !== "true" && item.offsetParent !== null;
    });
  }

  function onCartStateChanged() {
    if (!cartDrawer) return;
    const open = cartDrawer.getAttribute("aria-hidden") === "false";
    if (open) {
      if (!cartReturnFocus || !document.contains(cartReturnFocus)) {
        cartReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      setCartBackgroundInert(true);
      const first = focusablesWithin(cartDrawer)[0];
      requestAnimationFrame(() => first?.focus());
    } else {
      setCartBackgroundInert(false);
      const target = cartReturnFocus;
      cartReturnFocus = null;
      if (target && document.contains(target)) requestAnimationFrame(() => target.focus());
    }
  }

  function trapCartFocus(event) {
    if (!cartDrawer || cartDrawer.getAttribute("aria-hidden") !== "false" || event.key !== "Tab") return;
    const focusable = focusablesWithin(cartDrawer);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function rememberDialogOpener(dialog) {
    if (!dialog) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) dialogReturnFocus.set(dialog, active);
  }

  function restoreDialogFocus(dialog) {
    const target = dialogReturnFocus.get(dialog);
    dialogReturnFocus.delete(dialog);
    if (target && document.contains(target)) requestAnimationFrame(() => target.focus());
  }

  function makeRetryCard() {
    if (!menuGrid || menuGrid.querySelector("[data-retry-menu]")) return;
    menuGrid.innerHTML = `
      <div class="menu-retry" role="status">
        <strong>Não conseguimos carregar o cardápio agora.</strong>
        <p>Confira sua conexão e tente novamente. Seu carrinho continua salvo neste aparelho.</p>
        <button class="button button--soft" type="button" data-retry-menu>Tentar novamente</button>
      </div>`;
  }

  async function diagnoseMenuEmpty() {
    if (diagnosingMenu || !menuGrid || typeof state === "undefined" || state.menu.length) return;
    diagnosingMenu = true;
    try {
      const response = await fetch("/api/menu", { cache: "no-store" });
      if (!response.ok) throw new Error("menu unavailable");
      const data = await response.json();
      if (Array.isArray(data) && data.length) {
        if (typeof loadMenu === "function") await loadMenu();
        return;
      }
      menuGrid.innerHTML = `
        <div class="menu-retry" role="status">
          <strong>Cardápio temporariamente sem itens disponíveis.</strong>
          <p>Fale com a Vanuza para consultar as próximas opções.</p>
        </div>`;
    } catch (_error) {
      makeRetryCard();
    } finally {
      diagnosingMenu = false;
    }
  }

  function labelDynamicControls() {
    document.querySelectorAll('[data-qty="-1"]').forEach((button) => {
      button.setAttribute("aria-label", "Diminuir quantidade");
    });
    document.querySelectorAll('[data-qty="1"]').forEach((button) => {
      button.setAttribute("aria-label", "Aumentar quantidade");
    });
  }

  favoriteButton?.addEventListener("click", toggleFavorite);

  cartDrawer && new MutationObserver(onCartStateChanged).observe(cartDrawer, {
    attributes: true,
    attributeFilter: ["aria-hidden"],
  });
  document.addEventListener("keydown", trapCartFocus, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-product]")) rememberDialogOpener(productDialog);
    if (event.target.closest("#checkoutButton")) rememberDialogOpener(checkoutDialog);
    if (event.target.closest("[data-retry-menu]") && typeof loadMenu === "function") {
      menuGrid.innerHTML = "";
      if (menuLoading) menuLoading.hidden = false;
      loadMenu().then(() => diagnoseMenuEmpty());
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    if (event.target.closest("[data-product]")) rememberDialogOpener(productDialog);
  }, true);

  productDialog?.addEventListener("close", () => restoreDialogFocus(productDialog));
  checkoutDialog?.addEventListener("close", () => restoreDialogFocus(checkoutDialog));

  if (productDialog) {
    new MutationObserver(() => {
      if (productDialog.open) updateFavoriteState();
    }).observe(productDialog, { attributes: true, attributeFilter: ["open"] });
  }

  const cartItems = document.querySelector("#cartItems");
  cartItems && new MutationObserver(labelDynamicControls).observe(cartItems, {
    childList: true,
    subtree: true,
  });

  if (menuLoading) {
    new MutationObserver(() => {
      if (menuLoading.hidden) diagnoseMenuEmpty();
    }).observe(menuLoading, { attributes: true, attributeFilter: ["hidden"] });
  }

  labelDynamicControls();
  onCartStateChanged();
})();
