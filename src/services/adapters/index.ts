/**
 * Type transformation adapters for service integration.
 *
 * These adapters bridge DeviceService (SmartThings DeviceInfo) to
 * platform-agnostic services (DeviceRegistry, SemanticIndex) using
 * the unified device model.
 *
 * Architecture:
 * - DeviceService → DeviceInfo (SmartThings-specific)
 * - Transformer → UnifiedDevice (platform-agnostic)
 * - Adapter → Service integration (DeviceRegistry, SemanticIndex)
 *
 * @module services/adapters
 */

export { DeviceRegistryAdapter } from './DeviceRegistryAdapter.js';
export type { BatchAddResult, SyncResult } from './DeviceRegistryAdapter.js';

export { SemanticIndexAdapter } from './SemanticIndexAdapter.js';
export type { BatchIndexResult } from './SemanticIndexAdapter.js';
