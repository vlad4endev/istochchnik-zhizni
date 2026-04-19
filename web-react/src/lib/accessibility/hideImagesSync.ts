const PLACEHOLDER_ATTR = 'data-a11y-img-placeholder';
const SUPPRESSED_ATTR = 'data-a11y-img-suppressed';

function removeAllPlaceholders(root: HTMLElement): void {
  root.querySelectorAll(`span[${PLACEHOLDER_ATTR}="1"]`).forEach((el) => el.remove());
}

function resetImages(root: HTMLElement): void {
  root.querySelectorAll(`img[${SUPPRESSED_ATTR}="1"]`).forEach((img) => {
    img.classList.remove('a11y-img-hidden-visual');
    img.removeAttribute('aria-hidden');
    img.removeAttribute(SUPPRESSED_ATTR);
  });
}

/** Синхронизация режима «скрыть изображения»: подпись из alt вместо картинки. */
export function syncHideImages(root: HTMLElement, enabled: boolean): void {
  removeAllPlaceholders(root);
  resetImages(root);

  if (!enabled) return;

  const images = root.querySelectorAll('img');
  images.forEach((img) => {
    if (img.hasAttribute(SUPPRESSED_ATTR)) return;

    const altText = (img.getAttribute('alt') ?? '').trim() || 'Изображение без текстового описания';

    const ph = document.createElement('span');
    ph.setAttribute(PLACEHOLDER_ATTR, '1');
    ph.className = 'a11y-img-alt-block';
    ph.textContent = altText;

    img.insertAdjacentElement('beforebegin', ph);
    img.classList.add('a11y-img-hidden-visual');
    img.setAttribute('aria-hidden', 'true');
    img.setAttribute(SUPPRESSED_ATTR, '1');
  });
}
