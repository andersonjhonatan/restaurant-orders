(() => {
  const cartItemsRoot = document.querySelector("#cartItems");
  const clearCartButton = document.querySelector("#clearCartButton");

  if (!cartItemsRoot || !clearCartButton) return;

  function removeCartItem(encodedKey) {
    const key = decodeURIComponent(encodedKey);
    const item = state.cart.find((current) => current.key === key);
    if (!item) return;

    state.cart = state.cart.filter((current) => current.key !== key);
    saveCart();
    renderCart();
    showToast(`${item.label || item.name} removido do carrinho`);
  }

  function clearCart() {
    if (!state.cart.length) return;

    state.cart = [];
    saveCart();
    renderCart();
    showToast("Carrinho limpo");
  }

  function buildClearConfirmation() {
    const overlay = document.createElement("div");
    overlay.id = "clearCartConfirmation";
    overlay.className = "cart-confirm-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="cart-confirm-card" role="dialog" aria-modal="true" aria-labelledby="clearCartConfirmTitle" aria-describedby="clearCartConfirmText">
        <span class="cart-confirm-card__icon" aria-hidden="true"></span>
        <small>Sabor da Casa</small>
        <strong id="clearCartConfirmTitle">Limpar carrinho?</strong>
        <p id="clearCartConfirmText">Tem certeza que deseja limpar todos os pedidos?</p>
        <div class="cart-confirm-card__actions">
          <button type="button" class="cart-confirm-card__no" data-clear-cart-no>NÃO</button>
          <button type="button" class="cart-confirm-card__yes" data-clear-cart-yes>SIM</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  const confirmation = buildClearConfirmation();
  const confirmYes = confirmation.querySelector("[data-clear-cart-yes]");
  const confirmNo = confirmation.querySelector("[data-clear-cart-no]");
  let confirmationOpen = false;
  let lastOpenAt = 0;

  function openClearConfirmation() {
    if (!state.cart.length || confirmationOpen) return;

    const now = Date.now();
    if (now - lastOpenAt < 250) return;
    lastOpenAt = now;
    confirmationOpen = true;
    confirmation.hidden = false;
    requestAnimationFrame(() => confirmation.classList.add("is-open"));
    window.setTimeout(() => confirmNo.focus(), 40);
  }

  function closeClearConfirmation() {
    if (!confirmationOpen) return;
    confirmationOpen = false;
    confirmation.classList.remove("is-open");
    window.setTimeout(() => {
      confirmation.hidden = true;
      clearCartButton.focus({ preventScroll: true });
    }, 180);
  }

  function isPointInsideClearButton(x, y) {
    if (clearCartButton.hidden || !clearCartButton.offsetParent) return false;
    const rect = clearCartButton.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function decorateCartItems() {
    cartItemsRoot.querySelectorAll(".cart-item").forEach((row) => {
      if (row.querySelector(".cart-item__remove")) return;

      const quantityButton = row.querySelector("[data-key]");
      const priceArea = row.querySelector(".cart-item__price");
      if (!quantityButton || !priceArea) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "cart-item__remove";
      button.dataset.removeKey = quantityButton.dataset.key;
      button.setAttribute("aria-label", "Excluir este produto do carrinho");
      button.setAttribute("title", "Excluir produto");
      priceArea.appendChild(button);
    });
  }

  cartItemsRoot.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-key]");
    if (!removeButton) return;

    event.preventDefault();
    event.stopPropagation();
    removeCartItem(removeButton.dataset.removeKey);
  });

  /*
   * Captura o toque/clique pelas coordenadas antes dos elementos internos.
   * Assim toda a superfície visual do botão funciona, inclusive texto e ícone,
   * mesmo em navegadores móveis que entregam o evento a outro elemento.
   */
  document.addEventListener("pointerdown", (event) => {
    if (confirmationOpen || event.isPrimary === false || event.button > 0) return;
    if (!isPointInsideClearButton(event.clientX, event.clientY)) return;

    event.preventDefault();
    event.stopPropagation();
    openClearConfirmation();
  }, { capture: true, passive: false });

  /* Fallback para teclado e navegadores sem Pointer Events confiáveis. */
  clearCartButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openClearConfirmation();
  });

  confirmNo.addEventListener("click", (event) => {
    event.preventDefault();
    closeClearConfirmation();
  });

  confirmYes.addEventListener("click", (event) => {
    event.preventDefault();
    clearCart();
    closeClearConfirmation();
  });

  confirmation.addEventListener("click", (event) => {
    if (event.target === confirmation) closeClearConfirmation();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && confirmationOpen) closeClearConfirmation();
  });

  const observer = new MutationObserver(decorateCartItems);
  observer.observe(cartItemsRoot, { childList: true, subtree: true });
  decorateCartItems();
})();
