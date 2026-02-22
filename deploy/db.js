import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';

let client;
let container;

/**
 * Initialize the Cosmos DB client and ensure database/container exist.
 */
export async function initCosmosDb() {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const databaseName = process.env.COSMOS_DB_DATABASE || 'letssora';
  const containerName = process.env.COSMOS_DB_CONTAINER || 'generations';

  if (!endpoint) {
    console.warn('COSMOS_DB_ENDPOINT not set — history features disabled.');
    return false;
  }

  try {
    // Use DefaultAzureCredential (managed identity in prod, az login locally)
    const credential = new DefaultAzureCredential();
    client = new CosmosClient({ endpoint, aadCredentials: credential });

    const { database } = await client.databases.createIfNotExists({ id: databaseName });
    const { container: cont } = await database.containers.createIfNotExists({
      id: containerName,
      partitionKey: { paths: ['/userId'] },
    });
    container = cont;
    console.log(`Cosmos DB connected: ${endpoint} / ${databaseName} / ${containerName}`);
    return true;
  } catch (err) {
    console.error('Failed to initialize Cosmos DB:', err.message);
    return false;
  }
}

/**
 * Check if Cosmos DB is available.
 */
export function isDbAvailable() {
  return !!container;
}

/**
 * Save a generation record.
 * @param {object} generation - The generation object to save.
 * @returns {object} The created item.
 */
export async function saveGeneration(generation) {
  if (!container) throw new Error('Cosmos DB not initialized');

  const item = {
    id: generation.id || crypto.randomUUID(),
    userId: generation.userId || 'default',
    type: generation.type, // 'image' or 'video'
    prompt: generation.prompt,
    settings: generation.settings || {},
    result: generation.result || {},
    groundingImageCount: generation.groundingImageCount || 0,
    createdAt: new Date().toISOString(),
  };

  const { resource } = await container.items.create(item);
  return resource;
}

/**
 * Get a list of generations for a user, ordered by creation date (newest first).
 * @param {string} userId
 * @param {number} limit
 * @param {string} continuationToken
 * @returns {{ generations: object[], continuationToken: string|undefined }}
 */
export async function getGenerations(userId = 'default', limit = 50, continuationToken = undefined) {
  if (!container) throw new Error('Cosmos DB not initialized');

  const querySpec = {
    query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
    parameters: [{ name: '@userId', value: userId }],
  };

  const options = {
    maxItemCount: limit,
    continuationToken,
  };

  const { resources, continuationToken: nextToken } = await container.items
    .query(querySpec, options)
    .fetchNext();

  return { generations: resources, continuationToken: nextToken };
}

/**
 * Get a single generation by ID.
 * @param {string} id
 * @param {string} userId
 * @returns {object|null}
 */
export async function getGeneration(id, userId = 'default') {
  if (!container) throw new Error('Cosmos DB not initialized');

  try {
    const { resource } = await container.item(id, userId).read();
    return resource || null;
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
}

/**
 * Delete a generation by ID.
 * @param {string} id
 * @param {string} userId
 */
export async function deleteGeneration(id, userId = 'default') {
  if (!container) throw new Error('Cosmos DB not initialized');

  await container.item(id, userId).delete();
}
