import { SPOTIFY_CONFIG } from '../config';

export class SpotifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'SpotifyError';
  }
}

class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequest = 0;
  private readonly minDelay = 25; // Reduced delay between requests
  private readonly maxParallel = 3; // Allow 3 parallel requests

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequest;
          
          if (timeSinceLastRequest < this.minDelay) {
            await new Promise(r => setTimeout(r, this.minDelay - timeSinceLastRequest));
          }
          
          this.lastRequest = Date.now();
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.maxParallel);
      if (batch.length === 0) break;

      await Promise.all(batch.map(request => request()));
    }

    this.processing = false;
  }
}

class SpotifyService {
  private accessToken: string | null = null;
  private rateLimiter = new RateLimiter();

  constructor() {
    const isSecondUser = localStorage.getItem('isSecondUser') === 'true';
    const tokenKey = isSecondUser ? 'spotify_token_user2' : 'spotify_token_user1';
    const token = localStorage.getItem(tokenKey);
    if (token) {
      this.accessToken = token;
    }
  }

  getAuthUrl(isSecondUser: boolean): string {
    const params = new URLSearchParams({
      client_id: SPOTIFY_CONFIG.CLIENT_ID,
      response_type: 'token',
      redirect_uri: SPOTIFY_CONFIG.REDIRECT_URI,
      scope: SPOTIFY_CONFIG.SCOPES,
      show_dialog: 'true',
      state: isSecondUser ? 'second_user' : 'first_user'
    });

    return `${SPOTIFY_CONFIG.AUTH_URL}?${params.toString()}`;
  }

  login(isSecondUser: boolean) {
    localStorage.setItem('isSecondUser', String(isSecondUser));
    window.location.href = this.getAuthUrl(isSecondUser);
  }

  handleAuthCallback(): { success: boolean; isSecondUser: boolean } {
    const hash = window.location.hash.substring(1);
    const isSecondUser = localStorage.getItem('isSecondUser') === 'true';
    
    if (!hash) {
      return { success: false, isSecondUser };
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');

    if (!accessToken) {
      return { success: false, isSecondUser };
    }

    const tokenKey = isSecondUser ? 'spotify_token_user2' : 'spotify_token_user1';
    localStorage.setItem(tokenKey, accessToken);
    this.accessToken = accessToken;

    window.history.replaceState({}, document.title, 
      window.location.pathname + window.location.search);

    return { success: true, isSecondUser };
  }

  setAccessToken(token: string, isSecondUser: boolean) {
    this.accessToken = token;
    const tokenKey = isSecondUser ? 'spotify_token_user2' : 'spotify_token_user1';
    localStorage.setItem(tokenKey, token);
  }

  clearAccessToken() {
    this.accessToken = null;
    localStorage.removeItem('spotify_token_user1');
    localStorage.removeItem('spotify_token_user2');
    localStorage.removeItem('isSecondUser');
    localStorage.removeItem('appState');
    localStorage.removeItem('firstUserSongs');
    localStorage.removeItem('firstUserArtists');
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  private async fetchWithAuth(endpoint: string, options: RequestInit = {}) {
    if (!this.accessToken) {
      throw new SpotifyError(401, 'Not authenticated');
    }

    try {
      const response = await fetch(`${SPOTIFY_CONFIG.API_URL}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (response.status === 401) {
        this.clearAccessToken();
        throw new SpotifyError(401, 'Session expired, please log in again');
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch (e) {
          if (errorText) {
            errorMessage = errorText;
          }
        }

        throw new SpotifyError(response.status, errorMessage);
      }

      return response.json();
    } catch (error) {
      if (error instanceof SpotifyError) throw error;
      throw new SpotifyError(500, error instanceof Error ? error.message : 'Network error');
    }
  }

  async getCurrentUser() {
    return this.rateLimiter.add(() => this.fetchWithAuth('/me'));
  }

  private async getLikedSongsBatch(offset: number, limit: number) {
    return this.rateLimiter.add(() => 
      this.fetchWithAuth(`/me/tracks?limit=${limit}&offset=${offset}`)
    );
  }

  async getAllLikedSongs(progressCallback?: (progress: number) => void) {
    try {
      // First, get the total number of songs
      const firstPage = await this.getLikedSongsBatch(0, 1);
      const total = firstPage.total;

      if (total === 0) return [];

      // Calculate optimal batch size and create batch requests
      const batchSize = 50;
      const batches = Math.ceil(total / batchSize);
      const batchPromises = Array.from({ length: batches }, (_, i) => {
        const offset = i * batchSize;
        return this.getLikedSongsBatch(offset, batchSize);
      });

      // Process batches in parallel with progress tracking
      let completedBatches = 0;
      const songs = [];

      // Process 3 batches at a time
      for (let i = 0; i < batchPromises.length; i += 3) {
        const currentBatch = batchPromises.slice(i, i + 3);
        const results = await Promise.all(currentBatch);
        
        results.forEach(result => songs.push(...result.items));
        
        completedBatches += currentBatch.length;
        if (progressCallback) {
          progressCallback((completedBatches / batches) * 100);
        }
      }

      return songs;
    } catch (error) {
      throw error;
    }
  }

  async getTopArtists(limit = 50) {
    try {
      const response = await this.rateLimiter.add(() =>
        this.fetchWithAuth(`/me/top/artists?limit=${limit}&time_range=medium_term`)
      );
      return response.items;
    } catch (error) {
      if (error instanceof SpotifyError && error.status === 403) {
        return [];
      }
      throw error;
    }
  }

  async getFollowedArtists() {
    try {
      const response = await this.rateLimiter.add(() =>
        this.fetchWithAuth('/me/following?type=artist&limit=50')
      );
      return response.artists.items;
    } catch (error) {
      if (error instanceof SpotifyError && error.status === 403) {
        return [];
      }
      throw error;
    }
  }
}

export const spotifyService = new SpotifyService();