const THEME_KEY = "servicom_theme";
function applyTheme(theme){
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark-mode", dark);
  const toggle = document.getElementById("themeToggle");
  if(toggle){
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.setAttribute("aria-label", dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    toggle.title = dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
    const icon = toggle.querySelector(".theme-icon");
    if(icon) icon.textContent = dark ? "☾" : "☀";
  }
}
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  const preferred = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(preferred);
  const toggle = document.getElementById("themeToggle");
  if(toggle) toggle.onclick = () => {
    const next = document.documentElement.classList.contains("dark-mode") ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  };
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", initTheme); else initTheme();
