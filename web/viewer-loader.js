/* PDBe Mol* 3.12 adapter: model completion, cancellation, and bounded failure. */
(function(root) {
  function load(instance, element, options, signal, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let subscription;
      let timer;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription?.unsubscribe();
        signal?.removeEventListener('abort', aborted);
        if (error) reject(error); else resolve(instance);
      };
      const aborted = () => finish(new DOMException('Superseded model load', 'AbortError'));
      if (signal?.aborted) { aborted(); return; }
      signal?.addEventListener('abort', aborted, {once: true});
      subscription = instance.events.loadComplete.subscribe(success => {
        finish(success ? null : new Error('Coordinates or representation could not be loaded.'));
      });
      timer = setTimeout(() => finish(new Error('Model loading timed out. Retry when the connection is available.')), timeoutMs);
      // Subscribe before rendering: cached/local structures may finish quickly.
      Promise.resolve().then(() => instance.render(element, options)).then(() => {
        if (signal?.aborted) instance.plugin?.dispose();
      }).catch(finish);
    });
  }
  const api = {load};
  if (typeof module !== 'undefined') module.exports = api;
  else root.SpliceVisViewer = api;
})(globalThis);
