const menuToggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
const headerNav = document.querySelector<HTMLElement>('.header-nav');
function closeMenu() {
  menuToggle?.setAttribute('aria-expanded', 'false');
  headerNav?.classList.remove('is-open');
}
menuToggle?.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(open));
  headerNav?.classList.toggle('is-open', open);
});
headerNav?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') {
    closeMenu(); menuToggle.focus();
  }
});
document.addEventListener('click', event => {
  if (event.target instanceof Element && !event.target.closest('header')) closeMenu();
});
