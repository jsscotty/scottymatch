import React from 'react';
import { motion } from 'framer-motion';
import { Music, Clock, Play, Pause, RefreshCw } from 'lucide-react';
import { Song } from '../types';

interface SongListProps {
  songs: Song[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

function SongList({ songs, onRefresh, isLoading }: SongListProps) {
  const [playingSong, setPlayingSong] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const handlePlayPause = (previewUrl: string | null, songId: string) => {
    if (!previewUrl) return;

    if (playingSong === songId) {
      audioRef.current?.pause();
      setPlayingSong(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(previewUrl);
      audioRef.current.play();
      setPlayingSong(songId);

      audioRef.current.onended = () => {
        setPlayingSong(null);
      };
    }
  };

  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-2 md:p-6 shadow-xl">
      <div className="flex items-center gap-2 mb-3 md:mb-6">
        <Music className="text-purple-400" />
        <h2 className="text-xl font-semibold">Shared Songs</h2>
        <span className="ml-auto bg-purple-500/20 text-purple-300 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-sm">
          {songs.length} matches
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
        {songs.map((song, index) => (
          <motion.div
            key={song.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-2 md:gap-4 p-2 md:p-3 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-md overflow-hidden bg-purple-500/20 flex-shrink-0">
              {song.albumCover ? (
                <img
                  src={song.albumCover}
                  alt={`${song.title} album cover`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-5 h-5 md:w-6 md:h-6 text-purple-300" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm md:text-base truncate">{song.title}</h3>
              <p className="text-xs md:text-sm text-gray-400 truncate">{song.artist}</p>
            </div>
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
              <div className="flex items-center gap-1 text-gray-400 text-xs md:text-sm">
                <Clock className="w-3 h-3 md:w-4 md:h-4" />
                {song.duration}
              </div>
              {song.previewUrl && (
                <button
                  onClick={() => handlePlayPause(song.previewUrl, song.id)}
                  className="p-1 md:p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  title={playingSong === song.id ? 'Pause' : 'Play preview'}
                >
                  {playingSong === song.id ? (
                    <Pause className="w-3 h-3 md:w-4 md:h-4 text-green-400" />
                  ) : (
                    <Play className="w-3 h-3 md:w-4 md:h-4 text-green-400" />
                  )}
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default SongList;