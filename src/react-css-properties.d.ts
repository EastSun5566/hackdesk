import 'react';

declare module 'react' {
  // Lets components pass runtime values to classes such as `bg-(--swatch)`.
  interface CSSProperties {
    [key: `--${string}`]: string | undefined;
  }
}
