/**
 * Database Module (Legacy Entry Point)
 *
 * This file is maintained for backward compatibility.
 * All functionality has been moved to the database/ subdirectory.
 * 
 * New code should import from './database/index.js' directly.
 * @module database
 * @deprecated Use './database/index.js' instead
 */

// Re-export everything from the new modular structure
export * from './database/index.js';
