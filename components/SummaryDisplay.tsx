
import React from 'react';
import type { SummaryData } from '../types';
import { ChartBarIcon, DocumentTextIcon } from './icons';

interface SummaryDisplayProps {
  summary: SummaryData;
  fileName: string;
}

const SummaryCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="bg-gray-800 p-6 rounded-xl shadow-lg flex items-center space-x-4">
    <div className="bg-gray-700 p-3 rounded-full">{icon}</div>
    <div>
      <p className="text-sm text-gray-400">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  </div>
);

const SummaryDisplay: React.FC<SummaryDisplayProps> = ({ summary, fileName }) => {
  return (
    <div className="w-full max-w-5xl mx-auto mt-8">
      <h2 className="text-2xl font-bold text-white mb-2">Analysis Summary</h2>
      <p className="text-md text-gray-400 mb-6">File: <span className="font-mono bg-gray-700 text-indigo-300 px-2 py-1 rounded">{fileName}</span></p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard title="Total Chunks" value={summary.totalChunks.toLocaleString()} icon={<DocumentTextIcon className="w-6 h-6 text-indigo-400" />} />
        <SummaryCard title="Unique Sources" value={summary.uniqueSources.toLocaleString()} icon={<ChartBarIcon className="w-6 h-6 text-green-400" />} />
        <SummaryCard title="Total Characters" value={summary.totalTextLength.toLocaleString()} icon={<DocumentTextIcon className="w-6 h-6 text-sky-400" />} />
      </div>

      <div className="mt-8 bg-gray-800 p-6 rounded-xl shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Top 10 Sources by Chunk Count</h3>
        <ul className="space-y-3">
          {summary.topSources.map(({ source, count }) => (
            <li key={source} className="flex justify-between items-center text-gray-300">
              <span className="font-mono truncate pr-4" title={source}>{source}</span>
              <span className="font-semibold text-white bg-gray-700 px-3 py-1 rounded-full text-sm">{count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SummaryDisplay;
