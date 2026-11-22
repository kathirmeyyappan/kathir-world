// A press that may have to be made twice. While `warning` gives one, the button's first press says
// it (`say`) and turns the button to PRESS AGAIN, and only a second press while it's asking goes
// through; left alone for ASK_MS, the button is as it was and the warning is taken back.
const ASK_MS = 5000;

export function pressTwice(
  button: HTMLElement,
  warning: () => string | null,
  say: (text: string) => void,
  press: () => void,
): void {
  const label = button.textContent;
  let asking = 0; // the timer of a first press waiting on its second
  const settle = () => {
    clearTimeout(asking);
    asking = 0;
    button.textContent = label;
    say('');
  };
  button.addEventListener('click', () => {
    const warned = asking !== 0;
    settle();
    const text = warned ? null : warning();
    if (text === null) return press();
    button.textContent = 'PRESS AGAIN';
    say(text);
    asking = window.setTimeout(settle, ASK_MS);
  });
}
