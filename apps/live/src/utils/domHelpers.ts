/**
 * DOM Helper Utilities
 * Provides type-safe, reusable functions for common DOM operations
 */

/**
 * Safely gets an element by ID with type assertion
 * @param id - Element ID
 * @param elementType - Optional type assertion (e.g., HTMLInputElement)
 * @returns The element or null if not found
 */
export function getElementById<T extends HTMLElement = HTMLElement>(
  id: string,
  elementType?: new () => T
): T | null {
  const element = document.getElementById(id);
  if (!element) return null;
  return element as T;
}

/**
 * Safely gets an element by ID, throwing an error if not found
 * @param id - Element ID
 * @param errorMessage - Custom error message
 * @returns The element (never null)
 * @throws Error if element not found
 */
export function requireElementById<T extends HTMLElement = HTMLElement>(
  id: string,
  errorMessage?: string
): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(errorMessage || `Element with id "${id}" not found`);
  }
  return element as T;
}

/**
 * Safely queries a selector, returning the first match or null
 * @param selector - CSS selector
 * @param elementType - Optional type assertion
 * @returns The element or null if not found
 */
export function querySelector<T extends HTMLElement = HTMLElement>(
  selector: string,
  elementType?: new () => T
): T | null {
  const element = document.querySelector(selector);
  if (!element) return null;
  return element as T;
}

/**
 * Safely queries all matching elements
 * @param selector - CSS selector
 * @param parent - Optional parent element to search within
 * @returns Array of matching elements
 */
export function querySelectorAll<T extends HTMLElement = HTMLElement>(
  selector: string,
  parent?: Document | HTMLElement
): T[] {
  const searchRoot = parent || document;
  return Array.from(searchRoot.querySelectorAll(selector)) as T[];
}

/**
 * Creates a DOM element with optional attributes and content
 * @param tagName - HTML tag name
 * @param options - Element configuration
 * @returns The created element
 */
export function createElement<T extends HTMLElement = HTMLElement>(
  tagName: string,
  options: {
    className?: string;
    id?: string;
    textContent?: string;
    innerHTML?: string;
    attributes?: Record<string, string>;
    dataset?: Record<string, string>;
  } = {}
): T {
  const element = document.createElement(tagName) as T;

  if (options.className) {
    element.className = options.className;
  }

  if (options.id) {
    element.id = options.id;
  }

  if (options.textContent !== undefined) {
    element.textContent = options.textContent;
  }

  if (options.innerHTML !== undefined) {
    element.innerHTML = options.innerHTML;
  }

  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }

  if (options.dataset) {
    Object.entries(options.dataset).forEach(([key, value]) => {
      element.dataset[key] = value;
    });
  }

  return element;
}

/**
 * Shows an element by setting display style
 * @param element - Element to show
 * @param display - Display value (default: 'block')
 */
export function showElement(
  element: HTMLElement | null,
  display: string = 'block'
): void {
  if (element) {
    element.style.display = display;
  }
}

/**
 * Hides an element by setting display to none
 * @param element - Element to hide
 */
export function hideElement(element: HTMLElement | null): void {
  if (element) {
    element.style.display = 'none';
  }
}

/**
 * Toggles element visibility
 * @param element - Element to toggle
 * @param force - Optional: true to show, false to hide, undefined to toggle
 */
export function toggleElementVisibility(
  element: HTMLElement | null,
  force?: boolean
): void {
  if (!element) return;

  if (force !== undefined) {
    showElement(element, force ? 'block' : 'none');
  } else {
    const isHidden = element.style.display === 'none' || 
                     !element.style.display && window.getComputedStyle(element).display === 'none';
    showElement(element, isHidden ? 'block' : 'none');
  }
}

/**
 * Adds a CSS class to an element
 * @param element - Element to modify
 * @param className - Class name to add
 */
export function addClass(
  element: HTMLElement | null,
  className: string
): void {
  if (element) {
    element.classList.add(className);
  }
}

/**
 * Removes a CSS class from an element
 * @param element - Element to modify
 * @param className - Class name to remove
 */
export function removeClass(
  element: HTMLElement | null,
  className: string
): void {
  if (element) {
    element.classList.remove(className);
  }
}

/**
 * Toggles a CSS class on an element
 * @param element - Element to modify
 * @param className - Class name to toggle
 * @param force - Optional: true to add, false to remove, undefined to toggle
 */
export function toggleClass(
  element: HTMLElement | null,
  className: string,
  force?: boolean
): void {
  if (element) {
    element.classList.toggle(className, force);
  }
}

/**
 * Sets text content of an element
 * @param element - Element to modify
 * @param text - Text content to set
 */
export function setTextContent(
  element: HTMLElement | null,
  text: string
): void {
  if (element) {
    element.textContent = text;
  }
}

/**
 * Sets innerHTML of an element (use with caution - prefer textContent for safety)
 * @param element - Element to modify
 * @param html - HTML content to set
 */
export function setInnerHTML(
  element: HTMLElement | null,
  html: string
): void {
  if (element) {
    element.innerHTML = html;
  }
}

/**
 * Removes all children from an element
 * @param element - Element to clear
 */
export function clearElement(element: HTMLElement | null): void {
  if (element) {
    element.innerHTML = '';
  }
}

/**
 * Removes an element from the DOM
 * @param element - Element to remove
 */
export function removeElement(element: HTMLElement | null): void {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

/**
 * Appends a child element to a parent
 * @param parent - Parent element
 * @param child - Child element to append
 */
export function appendChild(
  parent: HTMLElement | null,
  child: HTMLElement
): void {
  if (parent) {
    parent.appendChild(child);
  }
}

/**
 * Inserts a child element before a reference element
 * @param parent - Parent element
 * @param newChild - New child element to insert
 * @param referenceChild - Reference child element
 */
export function insertBefore(
  parent: HTMLElement | null,
  newChild: HTMLElement,
  referenceChild: HTMLElement | null
): void {
  if (parent && referenceChild) {
    parent.insertBefore(newChild, referenceChild);
  } else if (parent) {
    parent.appendChild(newChild);
  }
}

/**
 * Creates a loading state element
 * @param text - Loading text to display
 * @param className - Optional additional class name
 * @returns The created loading element
 */
export function createLoadingElement(
  text: string,
  className: string = 'loading-text'
): HTMLElement {
  return createElement('div', {
    className,
    textContent: text
  });
}

/**
 * Shows loading state on an element
 * @param element - Element to show loading state on
 * @param loadingText - Text to display in loading element
 * @param loadingClassName - Class name for loading element
 */
export function showLoadingState(
  element: HTMLElement | null,
  loadingText: string,
  loadingClassName: string = 'loading-text'
): void {
  if (!element) return;

  addClass(element, 'loading');

  // Check if loading element already exists
  const existingLoading = element.querySelector(`.${loadingClassName}`);
  if (!existingLoading) {
    const loadingElement = createLoadingElement(loadingText, loadingClassName);
    appendChild(element, loadingElement);
  }
}

/**
 * Hides loading state on an element
 * @param element - Element to hide loading state on
 * @param loadingClassName - Class name for loading element
 */
export function hideLoadingState(
  element: HTMLElement | null,
  loadingClassName: string = 'loading-text'
): void {
  if (!element) return;

  removeClass(element, 'loading');

  const loadingElement = element.querySelector(`.${loadingClassName}`) as HTMLElement | null;
  if (loadingElement) {
    removeElement(loadingElement);
  }
}

/**
 * Shows an error message in an error element
 * @param errorElementId - ID of the error element
 * @param message - Error message to display
 */
export function showError(
  errorElementId: string,
  message: string
): void {
  const errorElement = getElementById(errorElementId);
  if (errorElement) {
    setTextContent(errorElement, message);
    showElement(errorElement);
  }
}

/**
 * Hides an error message
 * @param errorElementId - ID of the error element
 */
export function hideError(errorElementId: string): void {
  const errorElement = getElementById(errorElementId);
  if (errorElement) {
    hideElement(errorElement);
  }
}

/**
 * Checks if an element exists and is visible
 * @param element - Element to check
 * @returns True if element exists and is visible
 */
export function isElementVisible(element: HTMLElement | null): boolean {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Gets the computed style of an element
 * @param element - Element to get style from
 * @param property - CSS property name
 * @returns The computed style value
 */
export function getComputedStyleValue(
  element: HTMLElement | null,
  property: string
): string {
  if (!element) return '';
  return window.getComputedStyle(element).getPropertyValue(property);
}
