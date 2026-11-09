/**
 * Design audit: drives a running HackDesk dev build over the Chrome DevTools Protocol, captures each
 * scene in light and dark, and scores measurable design consistency (border colours, doubled lines,
 * alignment, spacing grid, type and radius scale, contrast, target size).
 *
 * The automated score is a lint signal, not the verdict. Pair it with the visual rubric in
 * scripts/design-audit-rubric.md, graded from the screenshots this script writes.
 *
 *   HACKDESK_REMOTE_DEBUGGING_PORT=9333 pnpm dev      # in one terminal
 *   pnpm design:audit [--port 9333] [--out .local/design-audit/<name>] [--scenes workspace,settings]
 *
 * The theme is switched by emulating prefers-color-scheme, so it only flips when Appearance is
 * set to System. Saved settings are never written.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

type Cdp = {
  send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  evaluate: <T>(expression: string) => Promise<T>;
  close: () => void;
};

type Offender = { where: string; detail: string; count: number };
type Metric = { name: string; score: number; max: number; summary: string; offenders: Offender[] };
type SceneResult = { scene: string; theme: string; screenshot: string; metrics: Metric[]; total: number };

type Scene = {
  name: string;
  /** Puts the app into the scene. Returns false when the scene cannot be reached. */
  enter: (cdp: Cdp) => Promise<boolean>;
  leave?: (cdp: Cdp) => Promise<void>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(port: number): Promise<Cdp> {
  const targets = await (await fetch(`http://localhost:${port}/json/list`)).json() as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>;
  const target = targets.find((t) => t.type === 'page' && t.url.includes('#/electron')) ?? targets.find((t) => t.type === 'page');
  if (!target) throw new Error(`No page target on port ${port}. Is HackDesk running with HACKDESK_REMOTE_DEBUGGING_PORT=${port}?`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } };
    if (message.id === undefined) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result ?? {});
  });
  const send: Cdp['send'] = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async <T>(expression: string): Promise<T> => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }) as {
      result: { value: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    };
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

async function pressKey(cdp: Cdp, key: string, code: string, keyCode: number, modifiers = 0) {
  for (const type of ['keyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, modifiers });
  }
}

const META = process.platform === 'darwin' ? 4 : 2;
const escape = (cdp: Cdp) => pressKey(cdp, 'Escape', 'Escape', 27);
const dialogOpen = (cdp: Cdp) => cdp.evaluate<boolean>(`!!document.querySelector('[role=dialog],[role=alertdialog]')`);

async function closeDialogs(cdp: Cdp) {
  for (let i = 0; i < 3 && await dialogOpen(cdp); i++) {
    await escape(cdp);
    await sleep(300);
  }
}

async function waitFor(cdp: Cdp, expression: string, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await cdp.evaluate<boolean>(`!!(${expression})`)) return true;
    await sleep(100);
  }
  return false;
}

const clickTab = (cdp: Cdp, label: string) => cdp.evaluate<boolean>(`(() => {
  const tab = [...document.querySelectorAll('[role=dialog] [role=tab]')].find((el) => el.textContent.trim().startsWith(${JSON.stringify(label)}));
  tab?.click();
  return !!tab;
})()`);

function settingsScene(tab: string): Scene {
  return {
    name: `settings-${tab.toLowerCase()}`,
    enter: async (cdp) => {
      await closeDialogs(cdp);
      await pressKey(cdp, ',', 'Comma', 188, META);
      if (!await waitFor(cdp, `document.querySelector('[role=dialog] [role=tab]')`)) return false;
      const found = await clickTab(cdp, tab);
      await sleep(400);
      return found;
    },
    leave: closeDialogs,
  };
}

// After a reload the workspace paints skeletons first; grade it only once the tree, the account
// and the open note have loaded.
const workspaceLoaded = (cdp: Cdp) => waitFor(cdp, `document.querySelector('[data-testid=folder-navigator-tree] [data-folder-tree-row-id^="note:"]')
  && document.querySelector('[data-testid=sidebar-footer-avatar]')
  && !document.querySelector('.animate-pulse')
  && !document.body.innerText.includes('Loading note')`, 20000);

const SCENES: Scene[] = [
  {
    name: 'workspace',
    enter: async (cdp) => {
      await closeDialogs(cdp);
      return workspaceLoaded(cdp);
    },
  },
  {
    name: 'tree-expanded',
    enter: async (cdp) => {
      await closeDialogs(cdp);
      if (!await workspaceLoaded(cdp)) return false;
      // Expand the first collapsed folder so nested rows and tree guides are on screen.
      return cdp.evaluate<boolean>(`(() => {
        const tree = document.querySelector('[data-testid=folder-navigator-tree]');
        const folder = tree?.querySelector('[aria-expanded=false]');
        if (!tree) return false;
        folder?.click();
        return true;
      })()`);
    },
  },
  {
    name: 'command-palette',
    enter: async (cdp) => {
      await closeDialogs(cdp);
      await pressKey(cdp, 'k', 'KeyK', 75, META);
      return waitFor(cdp, `document.querySelector('[role=dialog]')`);
    },
    leave: closeDialogs,
  },
  settingsScene('General'),
  settingsScene('Appearance'),
];

/**
 * Runs in the page. Walks the visible DOM and returns raw findings; scoring happens in Node so the
 * thresholds stay readable. Editor and preview content are user content, so they are excluded from
 * the typography, spacing, and contrast checks, but their frames still count for borders.
 */
const collect = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const rgba = (css: string): [number, number, number, number] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const hex = (c: number[]) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const over = (top: number[], bottom: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));

  const isUserContent = (el: Element) => !!el.closest('.cm-content, .cm-gutters, .markdown-body, [data-preview-content]');
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const s = getComputedStyle(el);
    // Visually hidden text (sr-only) is for screen readers, not the layout.
    if (r.width <= 1 && r.height <= 1 && s.overflow === 'hidden') return false;
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const effectiveOpacity = (el: Element | null) => {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  // Colour behind an element: its own background over its ancestors', down to the page.
  const backdrop = (el: Element | null): number[] => {
    const layers: number[][] = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 0.999) break;
    }
    let base = rgba(getComputedStyle(document.body).backgroundColor);
    if (base[3] < 1) base = [255, 255, 255, 1];
    let out = base.slice(0, 3);
    for (const layer of layers.reverse()) out = over(layer, [...out, 1]);
    return out;
  };
  const describe = (el: Element) => {
    const landmark = el.closest('[data-testid],[aria-label],[role=dialog],[role=tree],[role=tablist],header,nav,aside,footer');
    const label = (n: Element) => {
      const tid = n.getAttribute('data-testid');
      if (tid) return `[data-testid=${tid}]`;
      const role = n.getAttribute('role');
      const aria = n.getAttribute('aria-label');
      if (aria) return `${n.tagName.toLowerCase()}[aria-label="${aria.slice(0, 30)}"]`;
      if (role) return `${n.tagName.toLowerCase()}[role=${role}]`;
      return n.tagName.toLowerCase();
    };
    const own = `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}.${[...el.classList].slice(0, 4).join('.')}`;
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${landmark && landmark !== el ? label(landmark) + ' › ' : ''}${own}${text ? ` "${text}"` : ''}`;
  };

  const tokenNames = [
    'border-default', 'border-bold', 'border-primary-default', 'border-primary-subtler', 'focus-ring',
    'state-danger-border', 'state-warning-border', 'state-success-border', 'destructive-default',
    'warning-default', 'success-default', 'primary-default', 'element-border-hover', 'element-border-disabled',
    'hmd-tw-border-subtlest', 'hmd-tw-border-subtler', 'hmd-tw-border-subtle', 'text-subtle',
  ];
  const probe = document.createElement('div');
  document.body.append(probe);
  const tokens = tokenNames.map((name) => {
    probe.style.color = `var(--${name})`;
    return { name, rgba: rgba(getComputedStyle(probe).color) };
  }).filter((t) => t.rgba[3] > 0);
  probe.remove();
  const tokenFor = (c: number[]) => tokens.find((t) => t.rgba.every((v, i) => Math.abs(v - c[i]) <= (i === 3 ? 0.02 : 2)))?.name ?? null;

  // With a modal open, the page behind its overlay is out of play: judge only the floating layers.
  const modal = document.querySelector('[role=dialog],[role=alertdialog]');
  const inScope = (el: Element) => !modal || !!el.closest('[role=dialog],[role=alertdialog],[role=listbox],[role=menu],[role=tooltip]');
  const all = [...document.querySelectorAll('body *')].filter((el) => !(el instanceof SVGElement && el.tagName !== 'svg') && visible(el) && inScope(el));

  type Edge = { axis: 'h' | 'v'; at: number; from: number; to: number; color: string; owner: Element };
  const edges: Edge[] = [];
  const borders: Array<{ where: string; raw: string; painted: string; token: string | null; alpha: number }> = [];
  const pushLine = (el: Element, axis: 'h' | 'v', at: number, from: number, to: number, c: number[], css: string) => {
    if (c[3] < 0.05) return;
    const painted = hex(over(c, [...backdrop(el.parentElement), 1]));
    const token = tokenFor(c);
    borders.push({ where: describe(el), raw: css, painted, token, alpha: c[3] });
    if (to - from >= 24) edges.push({ axis, at, from, to, color: painted, owner: el });
  };

  for (const el of all) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const sides = [
      ['Top', 'h', r.top, r.left, r.right], ['Bottom', 'h', r.bottom, r.left, r.right],
      ['Left', 'v', r.left, r.top, r.bottom], ['Right', 'v', r.right, r.top, r.bottom],
    ] as const;
    for (const [side, axis, at, from, to] of sides) {
      const width = parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`));
      if (!width || s.getPropertyValue(`border-${side.toLowerCase()}-style`) === 'none') continue;
      const css = s.getPropertyValue(`border-${side.toLowerCase()}-color`);
      pushLine(el, axis, at, from, to, rgba(css), css);
    }
    // Hairline elements drawn with a background (dividers, tree guides) count as borders too.
    if ((r.width <= 1.5 || r.height <= 1.5) && rgba(s.backgroundColor)[3] > 0) {
      const c = rgba(s.backgroundColor);
      if (r.width <= 1.5) pushLine(el, 'v', r.left, r.top, r.bottom, c, s.backgroundColor);
      else pushLine(el, 'h', r.top, r.left, r.right, c, s.backgroundColor);
    }
    // 1px box-shadow rings act as borders.
    const ring = /(rgba?\([^)]*\)|#[0-9a-f]+|oklab\([^)]*\)|color\([^)]*\))\s+0px\s+0px\s+0px\s+1px/i.exec(s.boxShadow);
    if (ring) {
      const c = rgba(ring[1]);
      pushLine(el, 'h', r.top, r.left, r.right, c, ring[1]);
    }
  }

  // Parallel lines from different elements 1-6px apart read as a doubled border.
  const doubled: Array<{ where: string; detail: string }> = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i], b = edges[j];
      if (a.axis !== b.axis || a.owner === b.owner) continue;
      const gap = Math.abs(a.at - b.at);
      if (gap < 1 || gap > 6) continue;
      const overlap = Math.min(a.to, b.to) - Math.max(a.from, b.from);
      if (overlap < 0.6 * Math.min(a.to - a.from, b.to - b.from)) continue;
      doubled.push({ where: `${describe(a.owner)}  ⟷  ${describe(b.owner)}`, detail: `${a.axis === 'h' ? 'horizontal' : 'vertical'} lines ${gap.toFixed(1)}px apart (${a.color} / ${b.color})` });
    }
  }

  const chrome = all.filter((el) => !isUserContent(el));

  // Rows whose small children do not share a vertical centre.
  const misaligned: Array<{ where: string; detail: string }> = [];
  for (const el of chrome) {
    const s = getComputedStyle(el);
    if (!s.display.includes('flex') || !s.flexDirection.startsWith('row') || s.flexWrap === 'wrap') continue;
    const box = el.getBoundingClientRect();
    if (box.height > 72) continue;
    const kids = [...el.children].filter((k) => visible(k) && !['absolute', 'fixed'].includes(getComputedStyle(k).position));
    if (kids.length < 2) continue;
    const rects = kids.map((k) => k.getBoundingClientRect()).filter((k) => k.height <= 48 && k.height < box.height + 1);
    if (rects.length < 2) continue;
    const centres = rects.map((k) => k.top + k.height / 2);
    const spread = Math.max(...centres) - Math.min(...centres);
    if (spread > 2.5) misaligned.push({ where: describe(el), detail: `children centres differ by ${spread.toFixed(1)}px (align-items: ${s.alignItems})` });
  }

  // Spacing off the 2px grid.
  const offGrid: Array<{ where: string; detail: string }> = [];
  const spacingProps = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap'];
  for (const el of chrome) {
    const s = getComputedStyle(el);
    const bad = spacingProps
      .map((p) => [p, parseFloat(s.getPropertyValue(p))] as const)
      .filter(([, v]) => Number.isFinite(v) && Math.abs(v) > 1.5 && Math.abs(Math.round(v / 2) * 2 - v) > 0.26);
    if (bad.length) offGrid.push({ where: describe(el), detail: bad.map(([p, v]) => `${p}: ${+v.toFixed(2)}px`).join(', ') });
  }

  // Type scale and radius scale.
  const type = new Map<string, number>();
  const contrast: Array<{ where: string; detail: string; ratio: number }> = [];
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const el of chrome) {
    const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim().length > 0);
    if (!hasText) continue;
    const s = getComputedStyle(el);
    const key = `${parseFloat(s.fontSize)}px/${s.fontWeight}`;
    type.set(key, (type.get(key) ?? 0) + 1);
    if (el.closest('[disabled],[aria-disabled=true],[aria-hidden=true],kbd') || effectiveOpacity(el) < 0.95) continue;
    const bg = backdrop(el);
    const fg = over(rgba(s.color), [...bg, 1]);
    const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const large = parseFloat(s.fontSize) >= 18.6 || (parseFloat(s.fontSize) >= 14 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) contrast.push({ where: describe(el), detail: `${ratio.toFixed(2)}:1 (${hex(fg)} on ${hex(bg)}, ${s.fontSize})`, ratio });
  }
  const radii = new Map<string, number>();
  for (const el of chrome) {
    const s = getComputedStyle(el);
    const radius = parseFloat(s.borderTopLeftRadius);
    if (!radius) continue;
    const painted = rgba(s.backgroundColor)[3] > 0 || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== 'none';
    if (!painted) continue;
    const r = el.getBoundingClientRect();
    const key = radius >= Math.min(r.width, r.height) / 2 - 0.5 ? 'pill/circle' : `${radius}px`;
    radii.set(key, (radii.get(key) ?? 0) + 1);
  }

  const smallTargets: Array<{ where: string; detail: string }> = [];
  for (const el of chrome) {
    if (!el.matches('button, a[href], [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [role=radio]')) continue;
    // Resize sashes are thin on purpose; their hit area is the gap they sit in.
    if (/resize/.test(getComputedStyle(el).cursor)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) smallTargets.push({ where: describe(el), detail: `${r.width.toFixed(0)}×${r.height.toFixed(0)}px` });
  }

  // Large painted panels: how many distinct surface colours make up the layout.
  const surfaces = new Map<string, { area: number; where: string }>();
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 40_000 || rgba(getComputedStyle(el).backgroundColor)[3] < 0.05) continue;
    const key = hex(backdrop(el));
    const found = surfaces.get(key);
    if (found) found.area += r.width * r.height;
    else surfaces.set(key, { area: r.width * r.height, where: describe(el) });
  }

  return {
    viewport: [innerWidth, innerHeight],
    surfaces: [...surfaces.entries()].map(([color, v]) => ({ color, ...v })),
    tokens: tokens.map((t) => ({ name: t.name, color: hex(t.rgba) + (t.rgba[3] < 1 ? `/${t.rgba[3].toFixed(2)}` : '') })),
    borders, doubled, misaligned, offGrid, contrast, smallTargets,
    type: [...type.entries()], radii: [...radii.entries()],
  };
};

type Collected = ReturnType<typeof collect>;

function group(items: Array<{ where: string; detail: string }>): Offender[] {
  const map = new Map<string, Offender>();
  for (const item of items) {
    const key = `${item.where}|${item.detail}`;
    const found = map.get(key);
    if (found) found.count++;
    else map.set(key, { ...item, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v * 10) / 10));

function score(data: Collected): Metric[] {
  // Borders: neutral structure should use one or two painted colours, all from tokens.
  const neutral = data.borders.filter((b) => !b.token || /^(border-default|hmd-tw-border-|border-bold|element-border)/.test(b.token));
  const painted = new Map<string, Offender>();
  for (const b of neutral) {
    const found = painted.get(b.painted);
    if (found) found.count++;
    else painted.set(b.painted, { where: b.where, detail: `${b.painted} painted (${b.token ?? `off-token ${b.raw}`}${b.alpha < 1 ? `, alpha ${b.alpha.toFixed(2)}` : ''})`, count: 1 });
  }
  const offToken = group(data.borders.filter((b) => !b.token).map((b) => ({ where: b.where, detail: `off-token ${b.raw} → ${b.painted}` })));
  const offTokenColours = new Set(data.borders.filter((b) => !b.token).map((b) => b.painted)).size;
  const borderScore = 25 - 4 * offTokenColours - 3 * Math.max(0, painted.size - 2);

  const doubled = group(data.doubled);
  const misaligned = group(data.misaligned);
  const offGrid = group(data.offGrid);
  const contrast = group(data.contrast);
  const hardContrast = new Set(data.contrast.filter((c) => c.ratio < 3).map((c) => c.where)).size;
  const softContrast = new Set(data.contrast.filter((c) => c.ratio >= 3).map((c) => c.where)).size;
  const sizes = new Set(data.type.map(([k]) => k.split('/')[0]));
  const targets = group(data.smallTargets);

  return [
    {
      name: 'Border colours', max: 25, score: clamp(borderScore, 25),
      summary: `${painted.size} distinct neutral border colours painted; ${offTokenColours} off-token colour(s)`,
      offenders: [...[...painted.values()].sort((a, b) => b.count - a.count), ...offToken],
    },
    { name: 'Doubled lines', max: 15, score: clamp(15 - 3 * doubled.length, 15), summary: `${doubled.length} pair(s) of parallel lines 1–6px apart`, offenders: doubled },
    { name: 'Alignment', max: 15, score: clamp(15 - 1.5 * misaligned.length, 15), summary: `${misaligned.length} row(s) with off-centre children`, offenders: misaligned },
    { name: 'Contrast', max: 15, score: clamp(15 - 1.5 * hardContrast - 0.5 * softContrast, 15), summary: `${hardContrast} element group(s) under 3:1, ${softContrast} under 4.5:1`, offenders: contrast },
    { name: 'Spacing grid', max: 10, score: clamp(10 * (1 - offGrid.length / 20), 10), summary: `${offGrid.length} element(s) with spacing off the 2px grid`, offenders: offGrid },
    {
      name: 'Type scale', max: 5, score: clamp(5 - Math.max(0, sizes.size - 5) - 0.5 * Math.max(0, data.type.length - 9), 5),
      summary: `${sizes.size} font sizes, ${data.type.length} size/weight pairs`,
      offenders: data.type.sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ where: 'text', detail: k, count: n })),
    },
    {
      name: 'Radius scale', max: 5, score: clamp(5 - 1.5 * Math.max(0, data.radii.filter(([k]) => k !== 'pill/circle').length - 3), 5),
      summary: `${data.radii.length} radius values (${data.radii.map(([k]) => k).join(', ')})`,
      offenders: data.radii.sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ where: 'painted boxes', detail: k, count: n })),
    },
    {
      name: 'Surfaces', max: 5, score: clamp(5 - 1.5 * Math.max(0, data.surfaces.length - 3), 5),
      summary: `${data.surfaces.length} distinct large-panel surface colours`,
      offenders: data.surfaces.sort((a, b) => b.area - a.area).map((s) => ({ where: s.where, detail: `${s.color} (${Math.round(s.area / 1000)}k px²)`, count: 1 })),
    },
    { name: 'Target size', max: 5, score: clamp(5 - targets.length, 5), summary: `${targets.length} control(s) under 20px`, offenders: targets },
  ];
}

function markdown(results: SceneResult[], outDir: string) {
  const lines = ['# HackDesk design audit', '', `Generated ${new Date().toISOString()}.`, ''];
  const avg = results.reduce((sum, r) => sum + r.total, 0) / Math.max(1, results.length);
  lines.push(`**Automated score: ${avg.toFixed(1)} / 100** (mean of ${results.length} scene captures)`, '');
  lines.push('| Scene | Theme | ' + (results[0]?.metrics.map((m) => `${m.name} /${m.max}`).join(' | ') ?? '') + ' | Total |');
  lines.push('|---|---|' + (results[0]?.metrics.map(() => '---:').join('|') ?? '') + '|---:|');
  for (const r of results) lines.push(`| ${r.scene} | ${r.theme} | ${r.metrics.map((m) => m.score).join(' | ')} | **${r.total.toFixed(1)}** |`);
  for (const r of results) {
    lines.push('', `## ${r.scene} · ${r.theme}`, '', `![${r.scene} ${r.theme}](${path.relative(outDir, r.screenshot)})`, '');
    for (const m of r.metrics) {
      lines.push(`### ${m.name}: ${m.score}/${m.max}`, '', m.summary, '');
      for (const o of m.offenders.slice(0, 12)) lines.push(`- ${o.count > 1 ? `×${o.count} ` : ''}\`${o.where}\` — ${o.detail}`);
      if (m.offenders.length > 12) lines.push(`- … ${m.offenders.length - 12} more`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

// Colour transitions would otherwise be caught halfway through a theme switch.
const FREEZE_TRANSITIONS = `(() => {
  if (document.getElementById('design-audit-freeze')) return;
  const style = document.createElement('style');
  style.id = 'design-audit-freeze';
  style.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.append(style);
})()`;

async function main() {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: process.env.HACKDESK_REMOTE_DEBUGGING_PORT ?? '9333' },
      out: { type: 'string' },
      scenes: { type: 'string' },
      themes: { type: 'string', default: 'light,dark' },
      width: { type: 'string', default: '1280' },
      height: { type: 'string', default: '800' },
    },
  });
  const outDir = path.resolve(values.out ?? path.join('.local/design-audit', new Date().toISOString().replace(/[:.]/g, '-')));
  mkdirSync(outDir, { recursive: true });
  const wanted = values.scenes?.split(',');
  const scenes = SCENES.filter((s) => !wanted || wanted.includes(s.name));
  const cdp = await connect(Number(values.port));
  const results: SceneResult[] = [];
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: Number(values.width), height: Number(values.height), deviceScaleFactor: 2, mobile: false });
    for (const theme of values.themes.split(',')) {
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      // Start each theme from a fresh page: an unapplied Appearance preview (left by visiting that
      // tab on builds without the preview-leak fix) would otherwise pin the previous theme.
      await cdp.send('Page.reload');
      await sleep(1000);
      await waitFor(cdp, `document.querySelector('aside[aria-label=Sidebar]')`, 15_000);
      await waitFor(cdp, `document.documentElement.classList.contains('dark') === ${theme === 'dark'}`);
      await sleep(400);
      const actual = await cdp.evaluate<string>(`document.documentElement.classList.contains('dark') ? 'dark' : 'light'`);
      if (actual !== theme) console.warn(`! Asked for ${theme} but the app shows ${actual}. Set Appearance to System to audit both themes.`);
      for (const scene of scenes) {
        await cdp.evaluate(FREEZE_TRANSITIONS);
        if (!await scene.enter(cdp)) {
          console.warn(`! Skipped ${scene.name} (${theme}): could not reach it.`);
          await scene.leave?.(cdp);
          continue;
        }
        await sleep(500);
        const screenshot = path.join(outDir, `${scene.name}-${theme}.png`);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }) as { data: string };
        writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
        const data = await cdp.evaluate<Collected>(`(${collect.toString()})()`);
        const metrics = score(data);
        const total = metrics.reduce((sum, m) => sum + m.score, 0);
        results.push({ scene: scene.name, theme: actual, screenshot, metrics, total });
        writeFileSync(path.join(outDir, `${scene.name}-${theme}.json`), JSON.stringify({ ...data, metrics }, null, 2));
        console.log(`${scene.name.padEnd(20)} ${actual.padEnd(5)} ${total.toFixed(1).padStart(5)}  ${metrics.map((m) => `${m.name.split(' ')[0]} ${m.score}/${m.max}`).join('  ')}`);
        await scene.leave?.(cdp);
      }
    }
  } finally {
    await cdp.evaluate(`document.getElementById('design-audit-freeze')?.remove()`).catch(() => {});
    await cdp.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
    await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    cdp.close();
  }
  writeFileSync(path.join(outDir, 'report.md'), markdown(results, outDir));
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
  const avg = results.reduce((sum, r) => sum + r.total, 0) / Math.max(1, results.length);
  console.log(`\nAutomated score ${avg.toFixed(1)}/100 → ${path.join(outDir, 'report.md')}`);
}

await main();
