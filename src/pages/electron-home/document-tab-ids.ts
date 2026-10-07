export function documentTabId(tabId: string) {
  return `document-tab-${encodeURIComponent(tabId)}`;
}

export function documentPaneId(paneId: string) {
  return `document-pane-${encodeURIComponent(paneId)}`;
}
