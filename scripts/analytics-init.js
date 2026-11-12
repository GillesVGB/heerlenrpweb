/**
 * Vercel Web Analytics initialization
 * This script initializes Vercel Web Analytics for the site
 */
(function() {
  'use strict';
  
  // Check if running in browser
  if (typeof window === 'undefined') return;
  
  // Initialize the queue for Vercel Analytics
  if (!window.va) {
    window.va = function() {
      (window.vaq = window.vaq || []).push(arguments);
    };
  }
  
  // Set the SDK information
  var dataset = {
    sdkn: '@vercel/analytics',
    sdkv: '2.0.1'
  };
  
  // Determine the script source
  var scriptSrc = '/_vercel/insights/script.js';
  
  // Check if script is already loaded
  if (document.head.querySelector('script[src*="' + scriptSrc + '"]')) {
    return;
  }
  
  // Create and append the analytics script
  var script = document.createElement('script');
  script.src = scriptSrc;
  script.defer = true;
  
  // Add dataset attributes
  for (var key in dataset) {
    if (dataset.hasOwnProperty(key)) {
      script.dataset[key] = dataset[key];
    }
  }
  
  // Error handler
  script.onerror = function() {
    console.log('[Vercel Web Analytics] Failed to load analytics script. Please ensure Web Analytics is enabled in your Vercel dashboard.');
  };
  
  // Append to head
  document.head.appendChild(script);
})();
