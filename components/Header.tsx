import React, { useState, useEffect } from 'react';

export const Header: React.FC = () => {
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    // Simulate fetching an initial count and then incrementing it to feel live
    const baseCount = 14782;
    const initialCount = baseCount + Math.floor(Math.random() * 50);
    setUserCount(initialCount);

    const intervalId = setInterval(() => {
      // Increment by 1-3 every few seconds
      setUserCount(prevCount => (prevCount ? prevCount + Math.floor(Math.random() * 3) + 1 : initialCount + 1));
    }, 3000 + Math.random() * 2000); // Increment every 3-5 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  return (
    <header className="bg-gray-800/50 backdrop-blur-sm p-4 shadow-lg sticky top-0 z-10 border-b border-gray-700">
      <div className="container mx-auto flex items-center gap-4">
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2 border-gray-700">
            <img 
                src="https://storage.ko-fi.com/cdn/useruploads/641ac8f7-0ccd-47d0-b775-532bf235d9c4_7f5b18e9-ba-4cb3-a029-d6d243fdaabe.png" 
                alt="zGenMedia Logo" 
                className="w-full h-full object-cover"
            />
        </div>
        <div>
            <h1 className="text-2xl font-bold text-white">LAWIZ's Portrait Generator</h1>
            <p className="text-sm text-gray-400">
              Create stunning portrait variations from a single image using AI. 
              <span className="block sm:inline sm:ml-1">
                AI can make mistakes. We will update this daily. <a href="https://ko-fi.com/zgenmedia" target="_blank" rel="noopener noreferrer" className="font-semibold text-cyan-400 hover:underline">Donations</a> are greatly appreciated.
              </span>
            </p>
            {userCount !== null && (
              <p className="text-xs text-cyan-300/80 mt-1 font-mono">
                {userCount.toLocaleString()} users strong and counting!
              </p>
            )}
        </div>
      </div>
    </header>
  );
};