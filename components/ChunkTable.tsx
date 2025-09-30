import React from 'react';
import type { VectorChunk } from '../types';

interface ChunkTableProps {
  chunks: VectorChunk[];
  limit: number;
  width: number;
}

const ChunkTable: React.FC<ChunkTableProps> = ({ chunks, limit, width }) => {
  const truncateText = (text: string, maxWidth: number): string => {
    if (text.length <= maxWidth) {
      return text;
    }
    return text.substring(0, maxWidth) + '…';
  };

  if (limit === 0 || chunks.length === 0) {
    return null;
  }
  
  const displayedChunks = chunks.slice(0, limit);

  return (
    <div className="w-full max-w-5xl mx-auto mt-8">
      <h2 className="text-2xl font-bold text-white mb-6">Chunk Preview (First {Math.min(limit, chunks.length)})</h2>
      <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
        {displayedChunks.map((chunk, index) => (
          <div key={chunk.id}>
            <div className="space-y-2 text-sm p-2">
              <div>
                <span className="font-semibold text-gray-400 w-28 inline-block">ID</span>
                <span className="font-mono text-indigo-300 break-all">: {chunk.id}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-400 w-28 inline-block">Source</span>
                <span className="font-mono text-gray-300 break-all">: {chunk.source}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-400 w-28 inline-block">Start Index</span>
                <span className="font-mono text-gray-300">: {chunk.startIndex}</span>
              </div>
              <p className="font-mono text-gray-400 pt-2 whitespace-pre-wrap break-words">
                {truncateText(chunk.text, width)}
              </p>
            </div>
            {index < displayedChunks.length - 1 && (
               <hr className="border-gray-700 my-4" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChunkTable;
