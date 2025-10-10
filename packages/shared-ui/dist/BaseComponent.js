export class BaseComponent {
    constructor(element, errorService) {
        this.isDestroyed = false;
        this.errorService = errorService;
        if (typeof element === 'string') {
            const foundElement = document.querySelector(element);
            if (!foundElement) {
                throw new Error(`Element not found: ${element}`);
            }
            this.element = foundElement;
        }
        else {
            this.element = element;
        }
    }
    /**
     * Show the component
     */
    show() {
        this.element.style.display = '';
        this.element.classList.remove('hidden');
    }
    /**
     * Hide the component
     */
    hide() {
        this.element.style.display = 'none';
        this.element.classList.add('hidden');
    }
    /**
     * Toggle visibility
     */
    toggle() {
        if (this.element.style.display === 'none') {
            this.show();
        }
        else {
            this.hide();
        }
    }
    /**
     * Add CSS class
     */
    addClass(className) {
        this.element.classList.add(className);
    }
    /**
     * Remove CSS class
     */
    removeClass(className) {
        this.element.classList.remove(className);
    }
    /**
     * Toggle CSS class
     */
    toggleClass(className) {
        this.element.classList.toggle(className);
    }
    /**
     * Set attribute
     */
    setAttribute(name, value) {
        this.element.setAttribute(name, value);
    }
    /**
     * Get attribute
     */
    getAttribute(name) {
        return this.element.getAttribute(name);
    }
    /**
     * Set inner HTML
     */
    setHTML(html) {
        this.element.innerHTML = html;
    }
    /**
     * Get inner HTML
     */
    getHTML() {
        return this.element.innerHTML;
    }
    /**
     * Add event listener
     */
    addEventListener(type, listener) {
        this.element.addEventListener(type, listener);
    }
    /**
     * Remove event listener
     */
    removeEventListener(type, listener) {
        this.element.removeEventListener(type, listener);
    }
    /**
     * Dispatch custom event
     */
    dispatchEvent(event) {
        this.element.dispatchEvent(event);
    }
    /**
     * Find child element
     */
    find(selector) {
        return this.element.querySelector(selector);
    }
    /**
     * Find all child elements
     */
    findAll(selector) {
        return this.element.querySelectorAll(selector);
    }
    /**
     * Append child element
     */
    appendChild(child) {
        this.element.appendChild(child);
    }
    /**
     * Remove child element
     */
    removeChild(child) {
        this.element.removeChild(child);
    }
    /**
     * Clear all children
     */
    clear() {
        this.element.innerHTML = '';
    }
    /**
     * Get component data
     */
    getData() {
        return this.element.dataset;
    }
    /**
     * Set component data
     */
    setData(data) {
        Object.keys(data).forEach(key => {
            this.element.dataset[key] = data[key];
        });
    }
    /**
     * Check if component is visible
     */
    isVisible() {
        return this.element.offsetParent !== null;
    }
    /**
     * Get component dimensions
     */
    getDimensions() {
        const rect = this.element.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height
        };
    }
    /**
     * Destroy the component
     */
    destroy() {
        if (this.isDestroyed)
            return;
        this.isDestroyed = true;
        this.element.remove();
    }
    /**
     * Safe method execution with error handling
     */
    safeExecute(method, errorMessage) {
        try {
            return method();
        }
        catch (error) {
            this.errorService.error(errorMessage, error);
            return null;
        }
    }
    /**
     * Safe async method execution with error handling
     */
    async safeExecuteAsync(method, errorMessage) {
        try {
            return await method();
        }
        catch (error) {
            this.errorService.error(errorMessage, error);
            return null;
        }
    }
}
