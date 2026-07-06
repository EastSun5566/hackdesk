const folderColorPattern = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const folderIconPattern = /^[0-9A-Fa-f]{4,6}(?:-[0-9A-Fa-f]{4,6})*$/;

export function normalizeFolderColor(color: string | null) {
  return color && folderColorPattern.test(color) ? color : null;
}

export function decodeFolderIcon(icon: string | null) {
  if (!icon || !folderIconPattern.test(icon)) {
    return null;
  }

  try {
    return String.fromCodePoint(...icon.split('-').map((segment) => Number.parseInt(segment, 16)));
  } catch {
    return null;
  }
}
