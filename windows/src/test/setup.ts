// jsdom has no ResizeObserver; Popover uses it to follow its content size.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
