// Utility to load original JavaScript functions for compatibility
export const loadOriginalScripts = () => {
    if (typeof window === 'undefined')
        return;
    // Load the original live.js functions
    const script = document.createElement('script');
    script.src = '/javascripts/live.js';
    script.onload = () => {
        console.log('Original live.js loaded');
    };
    script.onerror = () => {
        console.error('Failed to load original live.js');
    };
    document.head.appendChild(script);
};
