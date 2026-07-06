export default {
  '*.{ts,tsx,js,cjs,mjs}': 'oxlint --fix',
  '*.rs': () => 'pnpm run lint:rs:fix',
};
