// BaseComponent - Base class for all UI components
import { ErrorService } from '../services/ErrorService';

export abstract class BaseComponent {
  protected element: HTMLElement;
  protected errorService: ErrorService;
  protected isDestroyed: boolean = false;

  constructor(element: HTMLElement | string, errorService: ErrorService) {
    this.errorService = errorService;

    if (typeof element === 'string') {
      const foundElement = document.querySelector(element) as HTMLElement;
      if (!foundElement) {
        throw new Error(`Element not found: ${element}`);
      }
      this.element = foundElement;
    } else {
      this.element = element;
    }
  }

  /**
   * Initialize the component
   */
  abstract initialize(): void;

  /**
   * Render the component
   */
  abstract render(): void;

  /**
   * Update the component
   */
  abstract update(data?: any): void;

  /**
   * Show the component
   */
  show(): void {
    this.element.style.display = '';
    this.element.classList.remove('hidden');
  }

  /**
   * Hide the component
   */
  hide(): void {
    this.element.style.display = 'none';
    this.element.classList.add('hidden');
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.element.style.display === 'none') {
      this.show();
    } else {
      this.hide();
    }
  }

  /**
   * Add CSS class
   */
  addClass(className: string): void {
    this.element.classList.add(className);
  }

  /**
   * Remove CSS class
   */
  removeClass(className: string): void {
    this.element.classList.remove(className);
  }

  /**
   * Toggle CSS class
   */
  toggleClass(className: string): void {
    this.element.classList.toggle(className);
  }

  /**
   * Set attribute
   */
  setAttribute(name: string, value: string): void {
    this.element.setAttribute(name, value);
  }

  /**
   * Get attribute
   */
  getAttribute(name: string): string | null {
    return this.element.getAttribute(name);
  }

  /**
   * Set inner HTML
   */
  setHTML(html: string): void {
    this.element.innerHTML = html;
  }

  /**
   * Get inner HTML
   */
  getHTML(): string {
    return this.element.innerHTML;
  }

  /**
   * Add event listener
   */
  addEventListener(type: string, listener: EventListener): void {
    this.element.addEventListener(type, listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(type: string, listener: EventListener): void {
    this.element.removeEventListener(type, listener);
  }

  /**
   * Dispatch custom event
   */
  dispatchEvent(event: CustomEvent): void {
    this.element.dispatchEvent(event);
  }

  /**
   * Find child element
   */
  find(selector: string): HTMLElement | null {
    return this.element.querySelector(selector);
  }

  /**
   * Find all child elements
   */
  findAll(selector: string): NodeListOf<HTMLElement> {
    return this.element.querySelectorAll(selector);
  }

  /**
   * Append child element
   */
  appendChild(child: HTMLElement): void {
    this.element.appendChild(child);
  }

  /**
   * Remove child element
   */
  removeChild(child: HTMLElement): void {
    this.element.removeChild(child);
  }

  /**
   * Clear all children
   */
  clear(): void {
    this.element.innerHTML = '';
  }

  /**
   * Get component data
   */
  getData(): any {
    return this.element.dataset;
  }

  /**
   * Set component data
   */
  setData(data: Record<string, string>): void {
    Object.keys(data).forEach(key => {
      this.element.dataset[key] = data[key];
    });
  }

  /**
   * Check if component is visible
   */
  isVisible(): boolean {
    return this.element.offsetParent !== null;
  }

  /**
   * Get component dimensions
   */
  getDimensions(): { width: number; height: number } {
    const rect = this.element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height
    };
  }

  /**
   * Destroy the component
   */
  destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;
    this.element.remove();
  }

  /**
   * Safe method execution with error handling
   */
  protected safeExecute<T>(method: () => T, errorMessage: string): T | null {
    try {
      return method();
    } catch (error) {
      this.errorService.error(errorMessage, error as Error);
      return null;
    }
  }

  /**
   * Safe async method execution with error handling
   */
  protected async safeExecuteAsync<T>(
    method: () => Promise<T>,
    errorMessage: string
  ): Promise<T | null> {
    try {
      return await method();
    } catch (error) {
      this.errorService.error(errorMessage, error as Error);
      return null;
    }
  }
}
