// Refreshes the saved release metadata that docs builds use when GitHub is unavailable.
import { writeFile } from 'node:fs/promises';

import { createReleaseSnapshot } from './utils.ts';

const snapshot = await createReleaseSnapshot();
await writeFile(new URL('./release-snapshot.json', import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Saved ${snapshot.releases.length} releases and the ${snapshot.legacyUpdater.tag} updater feed.`);
