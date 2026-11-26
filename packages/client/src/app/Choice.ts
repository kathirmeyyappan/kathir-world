// One of a few options, all in view: a row of buttons with the picked one lit (styles.css
// `.choices`), the first picked to start with.
export class Choice<T extends string> {
  value: T;

  constructor(root: HTMLElement, options: { value: T; label: string }[], picked?: (value: T) => void) {
    this.value = options[0].value;
    root.classList.add('choices');
    root.setAttribute('role', 'group');
    const buttons = options.map(({ value, label }) => {
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
      button.dataset.value = value;
      button.classList.toggle('on', value === this.value);
      button.addEventListener('click', () => {
        this.value = value;
        for (const b of buttons) b.classList.toggle('on', b === button);
        picked?.(value);
      });
      return button;
    });
    root.replaceChildren(...buttons);
  }
}
