/**
 * In-page signal collection. This function is serialized and executed inside the
 * browser page by Playwright, so it must be fully self-contained (no imports, no closures).
 * It only reads the DOM; it never mutates the page or performs network requests.
 */

export interface RawBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RawMoneyCandidate {
  box?: RawBox;
  elementText: string;
  rowText: string;
  testId: string | null;
  rowTestId: string | null;
  ariaLabel: string | null;
  nearestHeading: string | null;
  locator: string;
}

export interface RawFormControl {
  controlType: 'checkbox' | 'radio' | 'select';
  label: string;
  checked?: boolean;
  value?: string;
  locator: string;
  box?: RawBox;
}

export interface RawStructuredOffer {
  name: string | null;
  price: string | null;
  currency: string | null;
}

export interface RawPageSignals {
  url: string;
  title: string;
  bodyText: string;
  headings: string[];
  moneyCandidates: RawMoneyCandidate[];
  formControls: RawFormControl[];
  structuredOffers: RawStructuredOffer[];
}

export function collectPageSignals(): RawPageSignals {
  const MONEY = /(US\$|[$€£¥₦₹]|\b(?:USD|EUR|GBP|JPY|NGN|INR|CAD|AUD|CHF)\b)\s?\d|\d\s?([€£]|\b(?:USD|EUR|GBP|JPY|NGN|INR|CAD|AUD|CHF)\b)/;
  const MAX_CANDIDATES = 200;

  const isVisible = (el: Element): boolean => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = (el as HTMLElement).getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // Document coordinates (match a full-page screenshot), rounded to whole pixels.
  const boxOf = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
  };

  const textOf = (el: Element): string => ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();

  const cssPath = (el: Element): string => {
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return `#${el.id}`;
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && parts.length < 6) {
      const parentEl: Element | null = node.parentElement;
      let part = node.tagName.toLowerCase();
      if (parentEl) {
        const sameTag = Array.from(parentEl.children).filter((c) => c.tagName === node!.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const parentTestId = parentEl?.getAttribute('data-testid');
      if (parentTestId) {
        parts.unshift(`[data-testid="${parentTestId}"]`);
        break;
      }
      node = parentEl;
    }
    return parts.join(' > ');
  };

  const nearestHeading = (el: Element): string | null => {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
    let best: Element | null = null;
    for (const h of headings) {
      // Heading that precedes the element in document order
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
    }
    return best ? textOf(best) : null;
  };

  const countMoney = (el: Element): number =>
    candidates.filter((c) => el.contains(c) && c !== el).length + (candidates.includes(el) ? 1 : 0);

  // 1. Innermost visible elements whose text contains a money expression
  const all = Array.from(document.body.querySelectorAll('*')).filter(
    (el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG'].includes(el.tagName)
  );
  const candidates: Element[] = [];
  for (const el of all) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const text = textOf(el);
    if (!text || text.length > 160 || !MONEY.test(text)) continue;
    const childHasMoney = Array.from(el.children).some((c) => MONEY.test(textOf(c)));
    if (childHasMoney || !isVisible(el)) continue;
    candidates.push(el);
  }

  const moneyCandidates: RawMoneyCandidate[] = candidates.map((el) => {
    // Climb to the smallest ancestor that adds descriptive text but still contains only this amount
    let row: Element = el;
    let cursor: Element | null = el.parentElement;
    for (let depth = 0; cursor && cursor !== document.body && depth < 3; depth++) {
      if (countMoney(cursor) > 1) break;
      row = cursor;
      if (textOf(cursor).length > textOf(el).length + 2) break;
      cursor = cursor.parentElement;
    }
    const rowTestIdEl = row.closest('[data-testid]');
    return {
      box: boxOf(row),
      elementText: textOf(el),
      rowText: textOf(row),
      testId: el.getAttribute('data-testid'),
      rowTestId: rowTestIdEl && rowTestIdEl !== el ? rowTestIdEl.getAttribute('data-testid') : null,
      ariaLabel: el.getAttribute('aria-label'),
      nearestHeading: nearestHeading(el),
      locator: cssPath(el)
    };
  });

  // 2. Form controls with their current (default) state
  const labelFor = (input: HTMLInputElement | HTMLSelectElement): string => {
    const fromLabels = input.labels && input.labels.length > 0 ? textOf(input.labels[0]) : '';
    return fromLabels || input.getAttribute('aria-label') || input.getAttribute('name') || '';
  };
  const formControls: RawFormControl[] = [];
  for (const input of Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'))) {
    const el = input as HTMLInputElement;
    const container = el.closest('label') ?? el;
    if (!isVisible(container)) continue;
    formControls.push({
      controlType: el.type === 'radio' ? 'radio' : 'checkbox',
      label: labelFor(el),
      checked: el.checked,
      value: el.value,
      locator: cssPath(el),
      box: boxOf(container)
    });
  }
  for (const select of Array.from(document.querySelectorAll('select'))) {
    if (!isVisible(select)) continue;
    const option = select.selectedOptions[0];
    formControls.push({
      controlType: 'select',
      label: labelFor(select),
      value: option ? textOf(option) : '',
      locator: cssPath(select),
      box: boxOf(select)
    });
  }

  // 3. Structured product data (JSON-LD offers)
  const structuredOffers: RawStructuredOffer[] = [];
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(script.textContent ?? '');
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const offers = item?.offers ? (Array.isArray(item.offers) ? item.offers : [item.offers]) : [];
        for (const offer of offers) {
          structuredOffers.push({
            name: typeof item.name === 'string' ? item.name : null,
            price: offer?.price != null ? String(offer.price) : null,
            currency: typeof offer?.priceCurrency === 'string' ? offer.priceCurrency : null
          });
        }
      }
    } catch {
      // Malformed structured data is ignored; visible-text extraction still applies.
    }
  }

  return {
    url: window.location.href,
    title: document.title,
    bodyText: (document.body as HTMLElement).innerText ?? '',
    headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(textOf).filter(Boolean),
    moneyCandidates,
    formControls,
    structuredOffers
  };
}
