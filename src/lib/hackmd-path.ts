export type HackmdPublishType = 'edit' | 'view' | 'slide' | 'book';

export type HackmdNotePathInput = {
  publishType: HackmdPublishType;
  shortId: string;
  userPath: string | null;
  teamPath: string | null;
  permalink: string | null;
  publishLink: string;
};

const noteModeAlias: Record<HackmdPublishType, string> = {
  edit: '',
  view: 's',
  slide: 'p',
  book: 'c',
};

export function getHackmdPathFromPublishLink(publishLink?: string | null) {
  if (!publishLink) {
    return null;
  }

  try {
    const url = new URL(publishLink);

    if (url.origin !== 'https://hackmd.io') {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function getHackmdNotePath(note: HackmdNotePathInput, editMode = false) {
  if (note.teamPath) {
    const publishPath = getHackmdPathFromPublishLink(note.publishLink);

    if (publishPath) {
      return editMode ? `${publishPath.replace(/\/edit$/, '')}/edit` : publishPath;
    }
  }

  const namePath = note.userPath || note.teamPath;

  if (namePath) {
    const basePath = `/@${namePath}/${note.permalink || note.shortId}`;
    return editMode ? `${basePath}/edit` : basePath;
  }

  if (editMode) {
    return `/${note.shortId}`;
  }

  const mode = noteModeAlias[note.publishType];
  return mode ? `/${mode}/${note.shortId}` : `/${note.shortId}`;
}
