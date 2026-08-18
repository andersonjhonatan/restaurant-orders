(() => {
  const fallbackLogo = "https://cdn.jsdelivr.net/gh/andersonjhonatan/restaurant-orders@main/assets/logo-sabor-da-casa.svg";
  const partUrls = [1, 2, 3, 4].map((part) =>
    `https://cdn.jsdelivr.net/gh/andersonjhonatan/restaurant-orders@main/assets/logo_parts/new-logo-${String(part).padStart(2, "0")}.txt`
  );

  async function loadBrandLogo() {
    const images = [...document.querySelectorAll("[data-brand-logo]")];
    const favicons = [...document.querySelectorAll("[data-brand-favicon]")];

    const useFallback = () => {
      images.forEach((image) => {
        image.src = fallbackLogo;
        image.classList.add("brand-logo--ready");
      });
      favicons.forEach((icon) => { icon.href = fallbackLogo; });
    };

    try {
      const responses = await Promise.all(partUrls.map((url) => fetch(url, { cache: "force-cache" })));
      if (responses.some((response) => !response.ok)) throw new Error("Logo indisponível");

      const chunks = await Promise.all(responses.map((response) => response.text()));
      const base64 = chunks.join("").replace(/\s+/g, "");
      if (!base64.startsWith("UklGR")) throw new Error("Logo inválida");

      const source = `data:image/webp;base64,${base64}`;
      const probe = new Image();
      probe.onload = () => {
        images.forEach((image) => {
          image.src = source;
          image.classList.add("brand-logo--ready");
        });
        favicons.forEach((icon) => { icon.href = source; });
      };
      probe.onerror = useFallback;
      probe.src = source;
    } catch (_error) {
      useFallback();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadBrandLogo, { once: true });
  } else {
    loadBrandLogo();
  }
})();
