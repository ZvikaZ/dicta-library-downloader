import '@testing-library/jest-dom/vitest';

// jsdom implements neither of these layout APIs, and the reader uses both for
// navigation. Stubbing them here keeps the tests about behaviour.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
