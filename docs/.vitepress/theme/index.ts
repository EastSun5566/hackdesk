import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

import EditorShowcase from './EditorShowcase.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('EditorShowcase', EditorShowcase);
  },
} satisfies Theme;
