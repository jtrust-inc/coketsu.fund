function validateRequestChoices(form) {
  const choices = [...form.querySelectorAll('[data-request-choices] input[type="checkbox"]')];
  if (!choices.length) return true;
  const valid = choices.some(input => input.checked);
  choices[0].setCustomValidity(valid ? '' : 'ご希望の内容を1つ以上選択してください。');
  return valid;
}

document.querySelectorAll('form[data-confirm="true"]').forEach(form => {
  validateRequestChoices(form);
  form.addEventListener('change', () => validateRequestChoices(form));
});

function closeConfirmation(form) {
  delete form.dataset.confirmed;
  form.classList.remove('is-confirming');
  form.querySelector('.request-confirmation')?.remove();
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.textContent = '入力内容を確認する →';
}

function showConfirmation(form) {
  const data = new FormData(form);
  const panel = document.createElement('section');
  panel.className = 'request-confirmation';
  panel.tabIndex = -1;
  panel.setAttribute('aria-label', '入力内容の確認');
  const heading = document.createElement('h3');
  heading.textContent = '入力内容の確認';
  panel.append(heading);
  const list = document.createElement('dl');
  for (const [label, value] of [
    ['お名前', data.get('name')], ['メールアドレス', data.get('email')], ['電話番号', data.get('phone')],
    ['ご希望の内容', [data.get('request_material'), data.get('request_consultation')].filter(Boolean).join('・')],
    ['不動産小口投資の経験', data.get('investment_experience')], ['個人情報の取扱い', '同意する'],
  ]) {
    const term = document.createElement('dt'); term.textContent = label;
    const description = document.createElement('dd'); description.textContent = String(value || '');
    list.append(term, description);
  }
  panel.append(list);
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'request-edit'; edit.textContent = '入力内容を修正する';
  edit.addEventListener('click', () => {closeConfirmation(form); form.querySelector('[name="name"]')?.focus();});
  panel.append(edit);
  form.insertBefore(panel, form.querySelector('.cf-turnstile'));
  form.dataset.confirmed = 'true';
  form.classList.add('is-confirming');
  form.querySelector('[type="submit"]').textContent = 'この内容で送信する →';
  panel.focus();
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.astroForm) return;
  event.preventDefault();

  if (form.dataset.confirm === 'true') {
    if (!validateRequestChoices(form)) { closeConfirmation(form); form.reportValidity(); return; }
    if (form.dataset.confirmed !== 'true') { showConfirmation(form); return; }
  }

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
    if (form.dataset.confirm === 'true') { closeConfirmation(form); validateRequestChoices(form); }
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : "送信できませんでした。";
  } finally {
    if (submit instanceof HTMLInputElement || submit instanceof HTMLButtonElement) submit.disabled = false;
    if (window.turnstile) window.turnstile.reset(form.querySelector(".cf-turnstile"));
  }
});
