import React, { useState, useEffect, useCallback } from 'react';
import type { VectorChunk } from '../types';
import { performSearch } from '../lib/cosine-similarity';
import { SearchIcon } from './icons';

interface VectorSearchProps {
  chunks: VectorChunk[];
  embeddingModel: string;
  width: number;
  vectors: number[][];
  vocab: Map<string, number>;
}

interface SearchResult {
  chunk: VectorChunk;
  score: number;
}

const VectorSearch: React.FC<VectorSearchProps> = ({ chunks, embeddingModel, width, vectors, vocab }) => {
  const [query, setQuery] = useState('test query');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState('Indexing...');
  
  useEffect(() => {
    if (vectors && vectors.length > 0) {
      setStatus(`Index ready for ${chunks.length.toLocaleString()} documents.`);
    } else {
      setStatus('Waiting for data...');
    }
  }, [vectors, chunks.length]);


  const handleSearch = useCallback(() => {
    if (!vectors || !vocab) return;
    const searchResults = performSearch(query, chunks, vectors, vocab);
    setResults(searchResults);
  }, [query, chunks, vectors, vocab]);

  // Perform an initial search with the default query when the index is ready
  useEffect(() => {
    if (status.startsWith('Index ready')) {
      handleSearch();
    }
  }, [status, handleSearch]);

  const truncateText = (text: string, maxWidth: number): string => {
    if (text.length <= maxWidth) {
      return text;
    }
    return text.substring(0, maxWidth) + '…';
  };

  return (
    <div className="w-full max-w-5xl mx-auto mt-8">
      <h2 className="text-2xl font-bold text-white mb-6">Vector Search</h2>
      <div className="bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="mb-6 space-y-2">
            <p className="text-sm text-gray-400">
                <span className="font-semibold">Status:</span> 
                <span className={`ml-2 font-medium ${status.startsWith('Index ready') ? 'text-green-400' : 'text-yellow-400'}`}>
                    {status}
                </span>
            </p>
             <p className="text-sm text-gray-400">
                <span className="font-semibold">Search Method:</span> 
                <span className="ml-2 font-mono text-gray-300">In-browser Cosine Similarity (TF)</span>
             </p>
             <p className="text-sm text-gray-400">
                <span className="font-semibold">Embedding Model:</span> 
                <span className="ml-2 font-mono text-gray-300">{embeddingModel}</span>
             </p>
        </div>
      
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-grow">
             <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter your query..."
              className="w-full bg-gray-700 text-white rounded-md p-3 pl-10 border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              aria-label="Search query"
            />
             <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
          <button
            onClick={handleSearch}
            className="bg-indigo-600 text-white font-semibold px-6 py-3 rounded-md hover:bg-indigo-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            Search
          </button>
        </div>
        
        <div className="mt-8">
            <h3 className="text-lg font-semibold text-white mb-4">Search Results</h3>
            {results.length > 0 ? (
                <div className="space-y-4">
                    {results.map(({ chunk, score }) => (
                        <div key={chunk.id} className="bg-gray-700/50 p-4 rounded-lg">
                            <div className="flex justify-between items-start">
                                <div className="flex-grow pr-4">
                                    <p className="font-mono text-sm text-indigo-300 break-all" title={chunk.source}>{chunk.source}</p>
                                    <p className="font-mono text-xs text-gray-500 mt-1">ID: {chunk.id}</p>
                                </div>
                                <div className="flex-shrink-0">
                                    <span className="font-semibold text-white bg-gray-600 px-3 py-1 rounded-full text-sm">
                                        Score: {score.toFixed(4)}
                                    </span>
                                </div>
                            </div>
                             <p className="font-mono text-gray-400 pt-3 mt-3 border-t border-gray-700 whitespace-pre-wrap break-words">
                                {truncateText(chunk.text, width)}
                            </p>
                        </div>
                    ))}
                </div>
            ) : (
                 <div className="text-center py-8">
                    <p className="text-gray-500">No results found for your query.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default VectorSearch;
