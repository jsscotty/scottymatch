import React from 'react';
import { motion } from 'framer-motion';
import { Mic2, RefreshCw } from 'lucide-react';
import type { Artist } from '../types';

interface ArtistListProps {
  artists: Artist[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

function ArtistList({ artists, onRefresh, isLoading }: ArtistListProps) {
  return (
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-2 md:p-6 shadow-xl">
      <div className="flex items-center gap-2 mb-3 md:mb-6">
        <Mic2 className="text-purple-400" />
        <h2 className="text-xl font-semibold">Common Artists</h2>
        <span className="ml-auto bg-purple-500/20 text-purple-300 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-sm">
          {artists.length} matches
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={`p-1.5 md:p-2 hover:bg-white/10 rounded-full transition-colors
                     ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Refresh matches"
          >
            <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 text-purple-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      <div className="space-y-2 md:space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {artists.map((artist, index) => (
          <motion.div
            key={artist.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-2 md:gap-4 p-2 md:p-3 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden bg-purple-500/20 flex-shrink-0">
              {artist.imageUrl ? (
                <img
                  src={artist.imageUrl}
                  alt={artist.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Mic2 className="w-5 h-5 md:w-6 md:h-6 text-purple-300" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm md:text-base truncate">{artist.name}</h3>
              <div className="flex flex-wrap gap-1 md:gap-2 mt-0.5 md:mt-1">
                {artist.genres.slice(0, 3).map((genre) => (
                  <span
                    key={genre}
                    className="text-[10px] md:text-xs px-1.5 py-0.5 md:px-2 md:py-1 bg-purple-500/20 text-purple-300 rounded-full"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </div>
            <a
              href={artist.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-500 hover:text-green-400 transition-colors flex-shrink-0"
            >
              <Mic2 className="w-4 h-4 md:w-5 md:h-5" />
            </a>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default ArtistList;