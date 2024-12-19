import React from 'react';
import { motion } from 'framer-motion';
import { Music2, Users2, Heart, Loader2, LogOut, RefreshCw } from 'lucide-react';
import UserProfileCard from './components/UserProfile';
import SongList from './components/SongList';
import ArtistList from './components/ArtistList';
import ErrorMessage from './components/ErrorMessage';
import ProgressBar from './components/ProgressBar';
import { useSpotify } from './hooks/useSpotify';

function App() {
  const {
    isAuthenticated,
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
  } = useSpotify();

  const handleRefresh = () => {
    if (profiles.user1 && profiles.user2) {
      compareUsers(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-black text-white">
      <div className="container mx-auto px-3 md:px-4 py-4 md:py-8">
        <div className="relative flex justify-center mb-6 md:mb-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="flex items-center gap-2 md:gap-3">
              <Music2 className="w-7 h-7 md:w-10 md:h-10 text-green-500" />
              <div>
                <h1 className="text-2xl md:text-4xl font-bold">Scotties MusicMatch</h1>
                <p className="text-xs md:text-base text-gray-400 text-left">Discover the music that connects you</p>
              </div>
            </div>
          </motion.div>
          {isAuthenticated && (profiles.user1 || profiles.user2) && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={logout}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors 
                       p-2 rounded-full hover:bg-white/10 flex items-center gap-2"
              title="Logout"
            >
              <LogOut className="w-4 h-4 md:w-5 md:h-5" />
              <span className="hidden md:inline text-sm">Logout</span>
            </motion.button>
          )}
        </div>

        {!isAuthenticated ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto space-y-3 md:space-y-4 px-4 md:px-0"
          >
            <button
              onClick={() => login(false)}
              className={`w-full bg-green-500 hover:bg-green-600 text-white font-semibold 
                       py-3 md:py-4 px-4 md:px-6 rounded-lg flex items-center justify-center gap-2
                       text-sm md:text-base
                       ${profiles.user1 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!!profiles.user1}
            >
              <Music2 className="w-4 h-4 md:w-5 md:h-5" />
              Connect Your Account 
            </button>
            <button
              onClick={() => login(true)}
              className={`w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold 
                       py-3 md:py-4 px-4 md:px-6 rounded-lg flex items-center justify-center gap-2
                       text-sm md:text-base
                       ${!profiles.user1 || profiles.user2 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!profiles.user1 || !!profiles.user2}
            >
              <Users2 className="w-4 h-4 md:w-5 md:h-5" />
              Connect Friends Account
            </button>
          </motion.div>
        ) : (
          <>
            {(!profiles.user2 || isLoading) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="max-w-2xl mx-auto bg-gray-800/50 backdrop-blur-lg rounded-xl p-3 md:p-6 shadow-xl mb-4 md:mb-8"
              >
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="flex items-center gap-2">
                    <Users2 className="text-purple-400" />
                    <h2 className="text-base md:text-xl font-semibold">
                      {currentStep === 'first' ? 'Loading 1st User Data' : 
                       currentStep === 'second' ? 'Loading 2nd User Data' : ''}
                    </h2>
                  </div>
                </div>

                {error && <ErrorMessage message={error} />}

                {isLoading && progress > 0 && (
                  <div className="mt-3 md:mt-4">
                    <ProgressBar progress={progress} />
                    <p className="text-center text-xs md:text-sm text-gray-400 mt-2">
                      Retrieving music data... {Math.round(progress)}%
                    </p>
                  </div>
                )}

                {isFirstUserDone && !profiles.user2 && !isLoading && (
                  <div className="flex flex-col items-center gap-3 md:gap-4 mt-3 md:mt-4">
                    <p className="text-purple-300 text-xs md:text-base text-center">First user connected! Ready for second user.</p>
                    <button
                      onClick={() => login(true)}
                      className="bg-purple-500 hover:bg-purple-600 text-white font-semibold 
                               py-2 md:py-3 px-3 md:px-6 rounded-lg flex items-center justify-center gap-2
                               text-sm md:text-base"
                    >
                      <Users2 className="w-4 h-4 md:w-5 md:h-5" />
                      Connect Second User
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {(profiles.user1 || profiles.user2) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 mb-4 md:mb-8"
              >
                {profiles.user1 && <UserProfileCard profile={profiles.user1} />}
                {profiles.user2 && <UserProfileCard profile={profiles.user2} />}
              </motion.div>
            )}

            {(commonSongs.length > 0 || commonArtists.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6"
              >
                <SongList 
                  songs={commonSongs} 
                  onRefresh={handleRefresh}
                  isLoading={isLoading}
                />
                <ArtistList 
                  artists={commonArtists}
                  onRefresh={handleRefresh}
                  isLoading={isLoading}
                />
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;