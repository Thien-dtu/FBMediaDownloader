/**
 * User Profile Module (Legacy Entry Point)
 *
 * This file is maintained for backward compatibility.
 * All functionality has been moved to the profile/ subdirectory.
 * 
 * New code should import from './profile/index.js' directly.
 * @module user_profile
 * @deprecated Use './profile/index.js' instead
 */

// Re-export everything from the new modular structure
export * from './profile/index.js';
