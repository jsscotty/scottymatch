import React from 'react';
import { motion } from 'framer-motion';
import { Users, Music, ExternalLink } from 'lucide-react';
import type { UserProfile as UserProfileType } from '../types';

interface UserProfileProps {
  profile: UserProfileType;
}

function UserProfileCard({ profile }: UserProfileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-gray-800/30 rounded-lg p-2 md:p-4 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 md:gap-4">
        <img
          src={profile.avatarUrl || 'https://via.placeholder.com/100'}
          alt={profile.displayName}
          className="w-10 h-10 md:w-16 md:h-16 rounded-full object-cover border-2 border-purple-500"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm md:text-lg truncate">{profile.displayName}</h3>
          <p className="text-gray-400 text-xs truncate">@{profile.username}</p>
          <div className="flex items-center gap-3 mt-1 md:mt-2">
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3 md:w-4 md:h-4" />
              <span className="text-xs md:text-sm text-gray-300">{profile.followers.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Music className="w-3 h-3 md:w-4 md:h-4" />
              <span className="text-xs md:text-sm text-gray-300">{profile.following.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <a
          href={profile.spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-500 hover:text-green-400 transition-colors"
          title="Open in Spotify"
        >
          <ExternalLink className="w-4 h-4 md:w-5 md:h-5" />
        </a>
      </div>

      <div className="mt-2 md:mt-3 flex flex-wrap gap-1 md:gap-2">
        {profile.topGenres.map((genre) => (
          <span
            key={genre}
            className="px-1.5 py-0.5 md:px-2 md:py-1 bg-purple-500/20 text-purple-300 rounded-full text-[10px] md:text-xs"
          >
            {genre}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

export default UserProfileCard;