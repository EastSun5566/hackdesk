# Render Preview

A sample note for `pnpm render:preview`. It covers each live-preview feature, so a styling change can be checked in one shot. Paragraph with **bold**, *italic*, ~~strike~~, `inline code`, ==mark==, and a [link](https://hackmd.io).

## Lists

- First bullet item
- Second bullet item that is long enough to wrap onto a second line at the default editor width, so the hanging indent shows
  - Nested bullet
    - Deeper bullet
- [ ] An open task
- [x] A finished task

1. One
2. Two
   1. Nested ordered

## Images

![A mountain at dusk](photo.svg)

![image](photo.svg "Caption from the title")

![Sized to 200 wide](photo.svg =200x)

![Sized by height](photo.svg =x90)

![Half width](photo.svg =50%x)

## Inline HTML

Press <kbd>Cmd</kbd> + <kbd>K</kbd>. H<sub>2</sub>O and x<sup>2</sup>, <mark>marked</mark>, <ins>inserted</ins>, <del>deleted</del>, <u>underlined</u>, <b>bold</b>, <i>italic</i>, <small>small</small>, <abbr title="HyperText Markup Language">HTML</abbr>.
<span style="color: #d14">Red text</span> and <span style="background-color: yellow; position: fixed">highlighted</span><br>after a break.

<details>
<summary>Click to expand</summary>

Hidden body.
</details>

<img src="photo.svg" width="160" alt="An HTML image">

## Code blocks

```js=
const greet = (name) => {
  // say hello
  return `Hello, ${name}!`;
};
console.log(greet('world'), 42, true);
```

```python=+
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

```bash!
echo "a deliberately long command line that wraps because the fence ends with an exclamation mark" --flag=value
```

```
plain fence with a very long line that should either wrap or scroll horizontally depending on the chosen design for code blocks in this editor
```

## Blocks

> A blockquote line.
> A second line that is long enough to wrap onto another line at the default width, so the bar shows its full height.

> A quote with metadata.
> [name=Someone] [color=#2b8a3e]

> [!NOTE]
> A GitHub-style alert.

:::info
An info container.
:::

| Column | Value |
| ------ | ----- |
| a      | 1     |

$$
E = mc^2
$$

```math
\int_0^1 x^2 \, dx = \frac{1}{3}
```

Last line.
