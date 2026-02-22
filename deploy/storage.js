import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import crypto from 'crypto';

let blobServiceClient;
let containerClient;

/**
 * Initialize the Azure Blob Storage client.
 */
export async function initBlobStorage() {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'media';

  if (!accountName) {
    console.warn('AZURE_STORAGE_ACCOUNT_NAME not set — media storage disabled.');
    return false;
  }

  try {
    const credential = new DefaultAzureCredential();
    const url = `https://${accountName}.blob.core.windows.net`;
    blobServiceClient = new BlobServiceClient(url, credential);
    containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();
    console.log(`Blob Storage connected: ${url} / ${containerName}`);
    return true;
  } catch (err) {
    console.error('Failed to initialize Blob Storage:', err.message);
    return false;
  }
}

/**
 * Check if Blob Storage is available.
 */
export function isStorageAvailable() {
  return !!containerClient;
}

/**
 * Upload a buffer or base64 string to blob storage.
 * @param {Buffer|string} data - Buffer or base64 data URI string
 * @param {string} extension - File extension (e.g., 'png', 'mp4')
 * @param {string} contentType - MIME type
 * @returns {string} The blob URL
 */
export async function uploadMedia(data, extension, contentType) {
  if (!containerClient) throw new Error('Blob Storage not initialized');

  let buffer;
  if (typeof data === 'string') {
    // Handle base64 data URI: "data:image/png;base64,..."
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    buffer = data;
  }

  const blobName = `${crypto.randomUUID()}.${extension}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return blockBlobClient.url;
}

/**
 * Delete a blob by URL.
 * @param {string} blobUrl - The full blob URL
 */
export async function deleteMedia(blobUrl) {
  if (!containerClient) return;

  try {
    const url = new URL(blobUrl);
    const blobName = url.pathname.split('/').pop();
    if (blobName) {
      await containerClient.getBlockBlobClient(blobName).deleteIfExists();
    }
  } catch (err) {
    console.error('Failed to delete blob:', err.message);
  }
}

/**
 * Generate a SAS URL for read access to a blob (valid for 1 hour).
 * Falls back to raw blob URL if SAS generation fails.
 * @param {string} blobUrl - The full blob URL
 * @returns {string} A URL with SAS token or the original URL
 */
export async function getReadUrl(blobUrl) {
  // For now, return direct URL — in production, you'd generate a SAS token
  // or configure the storage account to allow access via managed identity proxy
  return blobUrl;
}
