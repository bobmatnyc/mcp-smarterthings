/**
 * Certificate manager for Lutron LEAP TLS authentication.
 *
 * Handles loading and validation of TLS certificates required for
 * Smart Bridge authentication via LEAP protocol.
 *
 * Design Decision: Flexible Certificate Loading
 * Rationale: Support both file-based and memory-based certificates
 * to accommodate different deployment scenarios (filesystem access,
 * environment variables, secret managers).
 *
 * Security: Certificates contain sensitive material. Store securely:
 * - File-based: Restrict permissions (chmod 600)
 * - Environment: Use encrypted secret storage
 * - Never commit certificates to source control
 *
 * @module platforms/lutron/certificate-manager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigurationError } from '../../types/errors.js';
import logger from '../../utils/logger.js';

/**
 * Certificate bundle for LEAP protocol.
 *
 * Contains all certificates required for mutual TLS authentication.
 */
export interface CertificateBundle {
  /** Client certificate (caseta.crt) */
  clientCert: Buffer;

  /** Client private key (caseta.key) */
  clientKey: Buffer;

  /** Bridge CA certificate (caseta-bridge.crt) */
  caCert: Buffer;
}

/**
 * Certificate paths configuration.
 */
export interface CertificatePaths {
  /** Path to client certificate file */
  certificatePath: string;

  /** Path to client private key file */
  privateKeyPath: string;

  /** Path to bridge CA certificate file */
  caCertificatePath: string;
}

/**
 * Load certificates from filesystem.
 *
 * Reads certificate files from disk and validates their existence.
 *
 * Error Handling:
 * - Throws ConfigurationError if any file is missing
 * - Throws ConfigurationError if file read fails
 * - Logs file paths for debugging
 *
 * @param paths Certificate file paths
 * @returns Certificate bundle with loaded certificate data
 * @throws {ConfigurationError} If certificate loading fails
 */
export async function loadCertificatesFromFiles(
  paths: CertificatePaths
): Promise<CertificateBundle> {
  logger.debug('Loading Lutron certificates from files', {
    certificatePath: paths.certificatePath,
    privateKeyPath: paths.privateKeyPath,
    caCertificatePath: paths.caCertificatePath,
  });

  try {
    // Load client certificate
    const clientCert = await loadFile(paths.certificatePath, 'Client certificate');

    // Load client private key
    const clientKey = await loadFile(paths.privateKeyPath, 'Client private key');

    // Load bridge CA certificate
    const caCert = await loadFile(paths.caCertificatePath, 'Bridge CA certificate');

    logger.info('Lutron certificates loaded successfully', {
      clientCertSize: clientCert.length,
      clientKeySize: clientKey.length,
      caCertSize: caCert.length,
    });

    return {
      clientCert,
      clientKey,
      caCert,
    };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(`Failed to load Lutron certificates: ${message}`, {
      platform: 'lutron',
      paths,
    });
  }
}

/**
 * Load certificates from memory buffers.
 *
 * Creates certificate bundle from pre-loaded buffers.
 * Useful when certificates are loaded from environment variables
 * or secret management systems.
 *
 * @param clientCert Client certificate buffer
 * @param clientKey Client private key buffer
 * @param caCert Bridge CA certificate buffer
 * @returns Certificate bundle
 */
export function loadCertificatesFromBuffers(
  clientCert: Buffer | string,
  clientKey: Buffer | string,
  caCert: Buffer | string
): CertificateBundle {
  logger.debug('Loading Lutron certificates from buffers', {
    clientCertSize: Buffer.isBuffer(clientCert) ? clientCert.length : clientCert.length,
    clientKeySize: Buffer.isBuffer(clientKey) ? clientKey.length : clientKey.length,
    caCertSize: Buffer.isBuffer(caCert) ? caCert.length : caCert.length,
  });

  return {
    clientCert: ensureBuffer(clientCert),
    clientKey: ensureBuffer(clientKey),
    caCert: ensureBuffer(caCert),
  };
}

/**
 * Validate certificate bundle.
 *
 * Performs basic validation on certificate data:
 * - Checks certificates are not empty
 * - Validates PEM format structure
 * - Checks for BEGIN/END markers
 *
 * Note: Does not perform cryptographic validation or expiration checking.
 * TLS handshake will fail if certificates are invalid.
 *
 * @param bundle Certificate bundle to validate
 * @throws {ConfigurationError} If validation fails
 */
export function validateCertificateBundle(bundle: CertificateBundle): void {
  logger.debug('Validating Lutron certificate bundle');

  // Validate client certificate
  validateCertificate(bundle.clientCert, 'Client certificate');

  // Validate client private key
  validatePrivateKey(bundle.clientKey, 'Client private key');

  // Validate CA certificate
  validateCertificate(bundle.caCert, 'Bridge CA certificate');

  logger.info('Lutron certificate bundle validation passed');
}

/**
 * Load certificate file with error handling.
 *
 * @param filePath Path to certificate file
 * @param name Human-readable certificate name for error messages
 * @returns File contents as buffer
 * @throws {ConfigurationError} If file cannot be read
 */
async function loadFile(filePath: string, name: string): Promise<Buffer> {
  try {
    // Resolve path (handle relative paths)
    const resolvedPath = path.resolve(filePath);

    // Check file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      throw new ConfigurationError(`${name} file not found: ${resolvedPath}`, {
        platform: 'lutron',
        filePath: resolvedPath,
      });
    }

    // Read file
    const data = await fs.readFile(resolvedPath);

    if (data.length === 0) {
      throw new ConfigurationError(`${name} file is empty: ${resolvedPath}`, {
        platform: 'lutron',
        filePath: resolvedPath,
      });
    }

    return data;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(`Failed to read ${name}: ${message}`, {
      platform: 'lutron',
      filePath,
    });
  }
}

/**
 * Ensure value is a Buffer.
 *
 * Converts string to Buffer if needed.
 *
 * @param value Buffer or string
 * @returns Buffer
 */
function ensureBuffer(value: Buffer | string): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  return Buffer.from(value, 'utf-8');
}

/**
 * Validate certificate PEM format.
 *
 * @param cert Certificate buffer
 * @param name Certificate name for error messages
 * @throws {ConfigurationError} If validation fails
 */
function validateCertificate(cert: Buffer, name: string): void {
  const certStr = cert.toString('utf-8');

  if (!certStr.includes('BEGIN CERTIFICATE')) {
    throw new ConfigurationError(`${name} is not a valid PEM certificate (missing BEGIN marker)`, {
      platform: 'lutron',
    });
  }

  if (!certStr.includes('END CERTIFICATE')) {
    throw new ConfigurationError(`${name} is not a valid PEM certificate (missing END marker)`, {
      platform: 'lutron',
    });
  }
}

/**
 * Validate private key PEM format.
 *
 * @param key Private key buffer
 * @param name Key name for error messages
 * @throws {ConfigurationError} If validation fails
 */
function validatePrivateKey(key: Buffer, name: string): void {
  const keyStr = key.toString('utf-8');

  // Check for various private key formats
  const hasPrivateKey =
    keyStr.includes('BEGIN PRIVATE KEY') ||
    keyStr.includes('BEGIN RSA PRIVATE KEY') ||
    keyStr.includes('BEGIN EC PRIVATE KEY');

  if (!hasPrivateKey) {
    throw new ConfigurationError(`${name} is not a valid PEM private key (missing BEGIN marker)`, {
      platform: 'lutron',
    });
  }

  const hasEndMarker =
    keyStr.includes('END PRIVATE KEY') ||
    keyStr.includes('END RSA PRIVATE KEY') ||
    keyStr.includes('END EC PRIVATE KEY');

  if (!hasEndMarker) {
    throw new ConfigurationError(`${name} is not a valid PEM private key (missing END marker)`, {
      platform: 'lutron',
    });
  }
}

/**
 * Get certificate info (for debugging).
 *
 * Extracts basic information from certificate without full parsing.
 *
 * @param cert Certificate buffer
 * @returns Certificate information
 */
export function getCertificateInfo(cert: Buffer): {
  size: number;
  isPEM: boolean;
  type: string;
} {
  const certStr = cert.toString('utf-8');

  let type = 'unknown';
  if (certStr.includes('BEGIN CERTIFICATE')) {
    type = 'x509';
  } else if (certStr.includes('BEGIN RSA PRIVATE KEY')) {
    type = 'rsa-private-key';
  } else if (certStr.includes('BEGIN EC PRIVATE KEY')) {
    type = 'ec-private-key';
  } else if (certStr.includes('BEGIN PRIVATE KEY')) {
    type = 'private-key';
  }

  return {
    size: cert.length,
    isPEM: certStr.includes('BEGIN '),
    type,
  };
}
