import { getStore } from '@netlify/blobs';
import { purgeCache, type Config } from '@netlify/functions';
import { handleShareRequest, type ShareStore } from '../../server/share';

// Strong consistency: a link has to be readable the moment it's created.
const blobs = getStore({ name: 'shares', consistency: 'strong' });

const store: ShareStore = {
  async get(key) {
    const data = await blobs.get(key, { type: 'arrayBuffer' });
    return data ? new Uint8Array(data) : null;
  },
  async set(key, body) {
    await blobs.set(key, typeof body === 'string' ? body : new Blob([body]));
  },
  async list(prefix) {
    const { blobs: entries } = await blobs.list({ prefix });
    return entries.map((entry) => entry.key);
  },
  async delete(key) {
    await blobs.delete(key);
  },
  async purge(cacheTags) {
    try {
      await purgeCache({ tags: cacheTags });
    } catch (error) {
      // Not fatal: worst case someone sees a deleted link's data until the cache expires.
      console.error('purgeCache failed', error);
    }
  },
};

export default (request: Request) => handleShareRequest(request, store);

export const config: Config = { path: '/api/share' };
