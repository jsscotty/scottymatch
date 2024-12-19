import { useState, useEffect, useCallback } from 'react';
import { spotifyService } from '../services/spotify';
import type { Song, Artist, UserProfile } from '../types';

interface UseSpotifyReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (isSecondUser: boolean) => void;
  logout: () => void;
  compareUsers: (forceRefresh?: boolean) => Promise<void>;
  commonSongs: Song[];
  commonArtists: Artist[];
  profiles: {
    user1: UserProfile | null;
    user2: UserProfile | null;
  };
  progress: number;
  isFirstUserDone: boolean;
  currentStep: 'first' | 'second' | 'comparing';
}

export function useSpotify(): UseSpotifyReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commonSongs, setCommonSongs] = useState<Song[]>([]);
  const [commonArtists, setCommonArtists] = useState<Artist[]>([]);
  const [profiles, setProfiles] = useState<{
    user1: UserProfile | null;
    user2: UserProfile | null;
  }>({ user1: null, user2: null });
  const [progress, setProgress] = useState(0);
  const [isFirstUserDone, setIsFirstUserDone] = useState(false);
  const [currentStep, setCurrentStep] = useState<'first' | 'second' | 'comparing'>('first');

  useEffect(() => {
    const savedState = localStorage.getItem('appState');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        setProfiles(state.profiles);
        setIsFirstUserDone(state.isFirstUserDone);
        setCurrentStep(state.currentStep);
        setCommonSongs(state.commonSongs || []);
        setCommonArtists(state.commonArtists || []);
      } catch (err) {
        console.error('Error loading saved state:', err);
      }
    }

    if (window.location.hash) {
      const { success, isSecondUser } = spotifyService.handleAuthCallback();
      if (!success) {
        setError('Authentication failed');
      } else {
        compareUsers(false, isSecondUser);
      }
    }
  }, []);

  useEffect(() => {
    const state = {
      profiles,
      isFirstUserDone,
      currentStep,
      commonSongs,
      commonArtists
    };
    localStorage.setItem('appState', JSON.stringify(state));
  }, [profiles, isFirstUserDone, currentStep, commonSongs, commonArtists]);

  const login = useCallback((isSecondUser: boolean) => {
    setError(null);
    spotifyService.login(isSecondUser);
  }, []);

  const logout = useCallback(() => {
    setError(null);
    spotifyService.clearAccessToken();
    setCommonSongs([]);
    setCommonArtists([]);
    setProfiles({ user1: null, user2: null });
    setIsFirstUserDone(false);
    setCurrentStep('first');
    localStorage.removeItem('appState');
  }, []);

  const getBestArtistImage = (artist: any): string => {
    if (artist.images && artist.images.length > 0) {
      // Try to get a medium-sized image first
      const mediumImage = artist.images.find(img => img.width === 300);
      if (mediumImage) return mediumImage.url;
      
      // Otherwise get the first available image
      return artist.images[0].url;
    }
    return '';
  };

  const compareUsers = useCallback(async (forceRefresh: boolean = false, isSecondUser: boolean = false) => {
    if (!spotifyService.isAuthenticated()) {
      return;
    }

    if (forceRefresh) {
      const existingData = {
        songs: commonSongs,
        artists: commonArtists,
        profiles: profiles
      };
      setCommonSongs(existingData.songs);
      setCommonArtists(existingData.artists);
      setProfiles(existingData.profiles);
    }

    setIsLoading(true);
    setError(null);
    setProgress(0);

    try {
      const [userProfile, songs, topArtists, followedArtists] = await Promise.all([
        spotifyService.getCurrentUser(),
        spotifyService.getAllLikedSongs(setProgress),
        spotifyService.getTopArtists(),
        spotifyService.getFollowedArtists()
      ]);

      // Extract artists from songs with their images
      const songArtists = songs.flatMap(item => 
        item.track.artists.map(artist => ({
          id: artist.id,
          name: artist.name,
          images: item.track.album.images, // Use album images for song artists
          external_urls: artist.external_urls,
          genres: []
        }))
      );

      // Combine all artists and ensure we keep the best available images
      const allArtists = [...songArtists, ...topArtists, ...followedArtists];
      const artistsMap = new Map();

      allArtists.forEach(artist => {
        const existing = artistsMap.get(artist.id);
        if (!existing || (artist.images && artist.images.length > 0)) {
          artistsMap.set(artist.id, artist);
        }
      });

      const uniqueArtists = Array.from(artistsMap.values()).map(artist => ({
        id: artist.id,
        name: artist.name,
        imageUrl: getBestArtistImage(artist),
        genres: artist.genres || [],
        spotifyUrl: artist.external_urls?.spotify || ''
      }));

      const transformedSongs = songs.map(item => ({
        id: item.track.id,
        title: item.track.name,
        artist: item.track.artists.map(a => a.name).join(', '),
        albumCover: item.track.album.images[0]?.url,
        duration: millisToMinutesAndSeconds(item.track.duration_ms),
        previewUrl: item.track.preview_url
      }));

      const userProfileData = {
        id: userProfile.id,
        username: userProfile.id,
        displayName: userProfile.display_name || userProfile.id,
        avatarUrl: userProfile.images?.[0]?.url,
        followers: userProfile.followers?.total || 0,
        following: uniqueArtists.length,
        topGenres: Array.from(new Set(uniqueArtists.flatMap(a => a.genres))).slice(0, 4),
        spotifyUrl: userProfile.external_urls?.spotify
      };

      if (!isSecondUser) {
        setProfiles(prev => ({ ...prev, user1: userProfileData }));
        setIsFirstUserDone(true);
        setCurrentStep('second');
        localStorage.setItem('firstUserSongs', JSON.stringify(transformedSongs));
        localStorage.setItem('firstUserArtists', JSON.stringify(uniqueArtists));
      } else {
        const firstUserSongs = JSON.parse(localStorage.getItem('firstUserSongs') || '[]');
        const firstUserArtists = JSON.parse(localStorage.getItem('firstUserArtists') || '[]');
        
        const commonSongsResult = transformedSongs.filter(song2 => 
          firstUserSongs.some(song1 => song1.id === song2.id)
        );

        const commonArtistsResult = uniqueArtists.filter(artist2 =>
          firstUserArtists.some(artist1 => artist1.id === artist2.id)
        );

        const commonSongArtistIds = new Set(
          commonSongsResult.flatMap(song => 
            songs.find(s => s.track.id === song.id)?.track.artists.map(a => a.id) || []
          )
        );

        const additionalArtists = uniqueArtists.filter(
          artist => commonSongArtistIds.has(artist.id) && 
                    !commonArtistsResult.some(a => a.id === artist.id)
        );

        setProfiles(prev => ({ ...prev, user2: userProfileData }));
        setCommonSongs(commonSongsResult);
        setCommonArtists([...commonArtistsResult, ...additionalArtists]);
        setCurrentStep('comparing');

        if (!forceRefresh) {
          localStorage.removeItem('firstUserSongs');
          localStorage.removeItem('firstUserArtists');
        }
      }
    } catch (err) {
      console.error('Compare users error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load user data');
    } finally {
      setIsLoading(false);
    }
  }, [commonSongs, commonArtists, profiles]);

  return {
    isAuthenticated: spotifyService.isAuthenticated(),
    isLoading,
    error,
    login,
    logout,
    compareUsers,
    commonSongs,
    commonArtists,
    profiles,
    progress,
    isFirstUserDone,
    currentStep
  };
}

function millisToMinutesAndSeconds(millis: number): string {
  const minutes = Math.floor(millis / 60000);
  const seconds = ((millis % 60000) / 1000).toFixed(0);
  return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;
}