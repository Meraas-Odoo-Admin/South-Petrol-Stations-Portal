// First-error focus for the hand-written forms (Phase 7, Part B leftover):
// when a submit is refused, the cursor goes to the first field that needs
// fixing, so a keyboard or screen-reader user lands on it and a phone scrolls
// to it. The react-hook-form screens already do this on their own.
//
// `testId` names the field's data-testid. When it marks a wrapper (a
// DigitBoxInput, a group of buttons), the first control inside it is focused.
export function focusField(testId: string): void {
  // After React has painted the error under the field.
  window.requestAnimationFrame(() => {
    const marked = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (!marked) return;
    const target = marked.matches('input, select, textarea, button')
      ? marked
      : marked.querySelector<HTMLElement>('input, select, textarea, button');
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

// The same, for a form whose fields mark their own error (aria-invalid, as
// TextField does): the first field in error, in the order of the form.
export function focusFirstInvalid(): void {
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
