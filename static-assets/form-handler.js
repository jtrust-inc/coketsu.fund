document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.astroForm) return;
  event.preventDefault();

  const status = form.querySelector(".astro-form-status");
  const submit = form.querySelector('[type="submit"]');
  if (status) status.textContent = "送信中です…";
  if (submit instanceof HTMLInputElement || submit instanceof HTMLButtonElement) submit.disabled = true;

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "送信できませんでした。時間をおいて再度お試しください。");
    if (status) status.textContent = result.message || "送信しました。";
    form.reset();
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : "送信できませんでした。";
  } finally {
    if (submit instanceof HTMLInputElement || submit instanceof HTMLButtonElement) submit.disabled = false;
    if (window.turnstile) window.turnstile.reset(form.querySelector(".cf-turnstile"));
  }
});
