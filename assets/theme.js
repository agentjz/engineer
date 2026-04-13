(() => {
  const storageKey = "theme";
  const themeLabels = {
    light: "切换到黑夜模式",
    dark: "切换到白天模式",
  };

  function getStoredTheme() {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }

  function setStoredTheme(theme) {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // Ignore storage errors and keep the current session theme only.
    }
  }

  function getPreferredTheme() {
    return getStoredTheme() === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-bs-theme", theme);
  }

  function updateToggleState(theme) {
    const toggle = document.getElementById("themeToggleLink");
    if (!toggle) {
      return;
    }

    const nextAction = themeLabels[theme] || themeLabels.light;
    toggle.textContent = nextAction;
    toggle.setAttribute("aria-label", nextAction);
    toggle.dataset.theme = theme;
  }

  function setTheme(theme) {
    setStoredTheme(theme);
    applyTheme(theme);
    updateToggleState(theme);
  }

  applyTheme(getPreferredTheme());

  window.addEventListener("DOMContentLoaded", () => {
    const currentTheme = getPreferredTheme();
    updateToggleState(currentTheme);

    const toggle = document.getElementById("themeToggleLink");
    if (!toggle) {
      return;
    }

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      const nextTheme = document.documentElement.getAttribute("data-bs-theme") === "dark"
        ? "light"
        : "dark";
      setTheme(nextTheme);
    });
  });
})();
