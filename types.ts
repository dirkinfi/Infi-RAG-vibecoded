
export interface VectorChunk {
  id: string;
  source: string;
  text: string;
  startIndex: number;
  [key: string]: any; // Allow for other fields
}

export interface SummaryData {
  totalChunks: number;
  uniqueSources: number;
  topSources: { source: string; count: number }[];
  totalTextLength: number;
}
