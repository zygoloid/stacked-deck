// A number with − and + either side of it (a count in a list field, a
// Hand's size). A click or tap on the number edits it as text: Enter or
// leaving the box sets it (when it is a whole number in range), Esc doesn't.
import { h } from './dom.js';

// n: the number. min, max: its range. prefix: drawn before it (×). onSet(n):
// a new number in range. title: what it is. cls: more classes. attrs: more
// attributes for the control.
export function stepper(n, { min = 1, max = Infinity, prefix = '', onSet, title, cls = '', attrs = {} }) {
  // (The buttons keep the focus where it is: on a phone, the keyboard down.)
  const noFocus = (e) => e.preventDefault();
  const set = (k) => { if (Number.isInteger(k) && k >= min && k <= max && k !== n) onSet(k); };
  const value = h('button', {
    class: 'stepper-n', title: `${title ? `${title}. ` : ''}Click to type a number`, 'aria-label': `${title ?? 'Number'}: ${n}`,
    onclick: () => edit(),
  }, `${prefix}${n}`);
  const el = h('span', { class: `stepper ${cls}`.trim(), title, ...attrs },
    h('button', { 'aria-label': 'One fewer', title: 'One fewer', onpointerdown: noFocus, disabled: n <= min, onclick: () => set(n - 1) }, '−'),
    value,
    h('button', { 'aria-label': 'One more', title: 'One more', onpointerdown: noFocus, disabled: n >= max, onclick: () => set(n + 1) }, '+'));
  function edit() {
    const box = h('input', {
      class: 'stepper-in', type: 'text', inputmode: 'numeric', enterkeyhint: 'done', value: String(n), 'aria-label': title ?? 'Number',
      style: { width: `calc(${Math.max(2, String(max === Infinity ? n : max).length) + 1}ch + 0.5rem)` },
    });
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      if (!box.isConnected) return;
      const k = Number(box.value.trim());
      box.replaceWith(value);
      if (keep) set(k);
    };
    box.addEventListener('keydown', (e) => {
      e.stopPropagation(); // (keys are the box's, not the editor's)
      if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    box.addEventListener('blur', () => finish(true));
    value.replaceWith(box);
    box.focus();
    box.select();
  }
  return el;
}
