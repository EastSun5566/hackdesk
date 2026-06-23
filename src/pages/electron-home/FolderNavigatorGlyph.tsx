import { Folder, FolderOpen } from 'lucide-react';

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

export function FolderGlyph({
  icon,
  color,
  open,
}: {
  icon: string | null;
  color: string | null;
  open?: boolean;
}) {
  const folderColor = normalizeFolderColor(color);
  const folderIcon = decodeFolderIcon(icon);

  if (folderIcon) {
    return (
      <span
        className="relative flex h-4 w-4 shrink-0 items-center justify-center text-[13px] leading-none"
        data-folder-glyph={icon ?? undefined}
        data-folder-color={folderColor ?? undefined}
      >
        {folderIcon}
        {folderColor ? (
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: folderColor }}
          />
        ) : null}
      </span>
    );
  }

  const Icon = open ? FolderOpen : Folder;

  return (
    <Icon
      className="h-3.5 w-3.5"
      data-folder-glyph="default"
      data-folder-color={folderColor ?? undefined}
      style={folderColor ? { color: folderColor } : undefined}
    />
  );
}
