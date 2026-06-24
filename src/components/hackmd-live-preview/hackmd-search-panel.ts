import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import { type EditorView, type Panel } from '@codemirror/view';

const ICON_PREVIOUS = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
const ICON_NEXT = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const ICON_CLOSE = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

export function createHackdeskSearchPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'cm-search cm-hackdesk-search-panel';
  dom.setAttribute('aria-label', 'Find in note');

  const form = document.createElement('form');
  form.autocomplete = 'off';
  form.className = 'cm-hackdesk-search-form';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    findNext(view);
  });

  const initialQuery = getSearchQuery(view.state);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Find';
  searchInput.value = initialQuery.search;
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.className = 'cm-hackdesk-search-input';
  searchInput.setAttribute('main-field', 'true');
  searchInput.setAttribute('aria-label', 'Find in note');
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSearchPanel(view);
      view.focus();
      return;
    }

    if (event.key !== 'Enter' || !event.shiftKey) {
      return;
    }

    event.preventDefault();
    findPrevious(view);
  });

  const count = document.createElement('span');
  count.className = 'cm-hackdesk-search-count';
  count.setAttribute('aria-live', 'polite');

  const previousButton = makeIconButton(ICON_PREVIOUS, 'Previous match', () => findPrevious(view));
  const nextButton = makeIconButton(ICON_NEXT, 'Next match', () => findNext(view));
  const closeButton = makeIconButton(ICON_CLOSE, 'Close search', () => closeSearchPanel(view));

  const recomputeCount = (query: SearchQuery) => {
    if (!query.search || !query.valid) {
      count.textContent = '';
      return;
    }

    let matches = 0;
    let capped = false;
    const cursor = query.getCursor(view.state.doc);

    while (!cursor.next().done) {
      matches += 1;
      if (matches >= 9999) {
        capped = true;
        break;
      }
    }

    count.textContent = capped
      ? '9999+'
      : matches === 0
        ? 'No results'
        : `${matches}`;
  };

  const dispatchQuery = () => {
    const query = new SearchQuery({ search: searchInput.value });
    view.dispatch({ effects: setSearchQuery.of(query) });
    recomputeCount(query);
  };

  searchInput.addEventListener('input', dispatchQuery);
  recomputeCount(initialQuery);

  form.append(searchInput, count, previousButton, nextButton, closeButton);
  dom.append(form);

  return {
    dom,
    top: true,
    mount() {
      searchInput.focus();
      searchInput.select();
    },
    update(update) {
      const nextQuery = getSearchQuery(update.state);
      const previousQuery = getSearchQuery(update.startState);

      if (nextQuery.search !== previousQuery.search && searchInput.value !== nextQuery.search) {
        searchInput.value = nextQuery.search;
      }

      if (update.docChanged || !nextQuery.eq(previousQuery)) {
        recomputeCount(nextQuery);
      }
    },
  };
}

function makeIconButton(
  svg: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cm-hackdesk-search-button';
  button.innerHTML = svg;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}
