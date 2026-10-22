/** True when the host page is dark (html class, data-theme or color-scheme); false on the server. */
export function isDocumentDark(): boolean {
  if (typeof document === "undefined") return false;
  const html = document.documentElement;
  return (
    html.classList.contains("dark") ||
    html.getAttribute("data-theme") === "dark" ||
    html.style.colorScheme === "dark"
  );
}
