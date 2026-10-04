let nextDiagramScope = 0;

const IMPORT = /@import\s+(?:url\(\s*(?:'[^']*'|"[^"]*"|[^)]*)\s*\)|'[^']*'|"[^"]*")[^;]*;/g;
const RULE_LIST = /^(?:\s*[^{}@]+\{[^{}]*\}\s*)*$/;
const RULE = /([^{}]+)\{([^{}]*)\}/g;

function scopeSelector(selector: string, scope: string) {
  // `svg { ... }` targets the diagram root itself; everything else is a descendant.
  return /^svg(?=$|[\s.#:[>+~])/.test(selector)
    ? `.${scope}${selector.slice(3)}`
    : `.${scope} ${selector}`;
}

/**
 * Limits a stylesheet to one diagram. Remote imports are dropped, and a
 * stylesheet with any other at-rule or nesting is dropped entirely, so an
 * unexpected shape loses styling instead of reaching the workbench.
 */
export function scopeDiagramCss(css: string, scope: string) {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(IMPORT, '');
  if (!RULE_LIST.test(rules)) return '';

  return [...rules.matchAll(RULE)]
    .filter(([, selectors]) => !/[()]/.test(selectors))
    .map(([, selectors, body]) => {
      const scoped = selectors.split(',').map((selector) => scopeSelector(selector.trim(), scope));
      return `${scoped.join(', ')} {${body}}`;
    })
    .join('\n');
}

/**
 * Keeps a sanitized diagram's <style> elements from styling anything outside
 * its own root <svg>. Theme colors still arrive through inherited CSS variables.
 */
export function scopeDiagramStyles(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const styles = [...template.content.querySelectorAll('style')];
  const roots = [...template.content.children];
  const root = roots.length === 1 && roots[0].localName === 'svg' ? roots[0] : null;

  if (!root) {
    for (const style of styles) style.remove();
    return template.innerHTML;
  }

  const scope = `cm-hackmd-diagram-${++nextDiagramScope}`;
  root.classList.add(scope);
  for (const style of styles) {
    style.textContent = scopeDiagramCss(style.textContent ?? '', scope);
  }
  return template.innerHTML;
}
