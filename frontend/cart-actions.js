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

    const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    const confirmed = window.confirm(
      `Remover ${itemCount} ${itemCount === 1 ? "item" : "itens"} do carrinho?`
    );

    if (!confirmed) return;

    state.cart = [];
    saveCart();
    renderCart();
    showToast("Carrinho limpo");
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

  clearCartButton.addEventListener("click", clearCart);

  const observer = new MutationObserver(decorateCartItems);
  observer.observe(cartItemsRoot, { childList: true, subtree: true });
  decorateCartItems();
})();
