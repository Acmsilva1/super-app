/* Loaded synchronously before application code. All HTML sinks pass through DOMPurify. */
(() => {
  'use strict';
  if (!window.DOMPurify?.isSupported) throw new Error('Sanitização indisponível.');
  const clean = input => window.DOMPurify.sanitize(String(input ?? ''), {
    RETURN_TRUSTED_TYPE: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link'],
    FORBID_ATTR: ['srcdoc'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
  // DOMPurify needs the native parser while sanitizing. Reentrancy is private to this closure.
  let parsing = false;
  const sanitize = value => {
    if (parsing) return value;
    parsing = true;
    try { return clean(value); } finally { parsing = false; }
  };
  if (window.trustedTypes) {
    window.trustedTypes.createPolicy('default', {
      createHTML: sanitize,
      createScriptURL(value) {
        const url = new URL(String(value), location.origin);
        if (url.origin === location.origin && /^\/(?:components|features|lib)\/[^?#]+\.m?js$/.test(url.pathname) && !url.search && !url.hash) return url.href;
        throw new TypeError('Origem de script não autorizada.');
      },
    });
  }
  for (const [prototype, name] of [[Element.prototype, 'innerHTML'], [Element.prototype, 'outerHTML'],
    ...(window.ShadowRoot ? [[ShadowRoot.prototype, 'innerHTML']] : [])]) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor?.set) continue;
    Object.defineProperty(prototype, name, { ...descriptor, set(value) {
      descriptor.set.call(this, sanitize(value));
    } });
  }
  const insert = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(position, html) { return insert.call(this, position, sanitize(html)); };
  const fragment = Range.prototype.createContextualFragment;
  Range.prototype.createContextualFragment = function(html) { return fragment.call(this, sanitize(html)); };
  document.write = document.writeln = () => { throw new Error('document.write bloqueado'); };
})();
