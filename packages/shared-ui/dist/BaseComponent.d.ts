import { ErrorService } from '@pubpay/shared-services';
export declare abstract class BaseComponent {
    protected element: HTMLElement;
    protected errorService: ErrorService;
    protected isDestroyed: boolean;
    constructor(element: HTMLElement | string, errorService: ErrorService);
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
    show(): void;
    /**
     * Hide the component
     */
    hide(): void;
    /**
     * Toggle visibility
     */
    toggle(): void;
    /**
     * Add CSS class
     */
    addClass(className: string): void;
    /**
     * Remove CSS class
     */
    removeClass(className: string): void;
    /**
     * Toggle CSS class
     */
    toggleClass(className: string): void;
    /**
     * Set attribute
     */
    setAttribute(name: string, value: string): void;
    /**
     * Get attribute
     */
    getAttribute(name: string): string | null;
    /**
     * Set inner HTML
     */
    setHTML(html: string): void;
    /**
     * Get inner HTML
     */
    getHTML(): string;
    /**
     * Add event listener
     */
    addEventListener(type: string, listener: EventListener): void;
    /**
     * Remove event listener
     */
    removeEventListener(type: string, listener: EventListener): void;
    /**
     * Dispatch custom event
     */
    dispatchEvent(event: CustomEvent): void;
    /**
     * Find child element
     */
    find(selector: string): HTMLElement | null;
    /**
     * Find all child elements
     */
    findAll(selector: string): NodeListOf<HTMLElement>;
    /**
     * Append child element
     */
    appendChild(child: HTMLElement): void;
    /**
     * Remove child element
     */
    removeChild(child: HTMLElement): void;
    /**
     * Clear all children
     */
    clear(): void;
    /**
     * Get component data
     */
    getData(): any;
    /**
     * Set component data
     */
    setData(data: Record<string, string>): void;
    /**
     * Check if component is visible
     */
    isVisible(): boolean;
    /**
     * Get component dimensions
     */
    getDimensions(): {
        width: number;
        height: number;
    };
    /**
     * Destroy the component
     */
    destroy(): void;
    /**
     * Safe method execution with error handling
     */
    protected safeExecute<T>(method: () => T, errorMessage: string): T | null;
    /**
     * Safe async method execution with error handling
     */
    protected safeExecuteAsync<T>(method: () => Promise<T>, errorMessage: string): Promise<T | null>;
}
