// load_layouts.js
(async function loadSharedLayouts() {
  const version = "pharm_v2";
  const layouts = [
    `/assets/layouts/billing.html?v=${version}`,
    `/assets/layouts/labs.html?v=${version}`,
    `/assets/layouts/vitals.html?v=${version}`,
  ];

  for (const url of layouts) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const html = await response.text();
        const container = document.createElement("div");
        container.innerHTML = html.trim();

        while (container.firstChild) {
          if (
            container.firstChild.id &&
            !document.getElementById(container.firstChild.id)
          ) {
            document.body.appendChild(container.firstChild);
          } else if (!container.firstChild.id) {
            document.body.appendChild(container.firstChild);
          } else {
            container.removeChild(container.firstChild);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to load layout from ${url}:`, error);
    }
  }

  // Ensure modular labs engine is loaded
  if (
    !window.Tap2MedLabs &&
    !document.querySelector('script[src*="/assets/js/labs.js"]')
  ) {
    const labScript = document.createElement("script");
    labScript.src = `/assets/js/labs.js?v=${version}`;
    document.body.appendChild(labScript);
  }
})();
