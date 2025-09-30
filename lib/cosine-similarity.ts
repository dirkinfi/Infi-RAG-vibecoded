import type { VectorChunk } from '../types';

// Simple text processing: lowercase and split by non-alphanumeric characters
const tokenize = (text: string): string[] => {
  return text.toLowerCase().match(/\b\w+\b/g) || [];
};

// Build a vocabulary from a set of tokenized documents
const createVocabulary = (tokenizedDocs: string[][]): Map<string, number> => {
  const vocab = new Map<string, number>();
  let index = 0;
  tokenizedDocs.forEach(tokens => {
    tokens.forEach(token => {
      if (!vocab.has(token)) {
        vocab.set(token, index++);
      }
    });
  });
  return vocab;
};

// Create a term-frequency (TF) vector for a single document
const createTfVector = (tokens: string[], vocab: Map<string, number>): number[] => {
  const vector = new Array(vocab.size).fill(0);
  tokens.forEach(token => {
    const tokenIndex = vocab.get(token);
    if (tokenIndex !== undefined) {
      vector[tokenIndex]++;
    }
  });
  return vector;
};

// Calculate cosine similarity between two vectors
const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dotProduct / (magA * magB);
};

// Precompute vectors for all documents
export const precomputeVectors = (chunks: VectorChunk[]): { vectors: number[][]; vocab: Map<string, number> } => {
  const tokenizedDocs = chunks.map(chunk => tokenize(chunk.text));
  const vocab = createVocabulary(tokenizedDocs);
  const vectors = tokenizedDocs.map(tokens => createTfVector(tokens, vocab));
  return { vectors, vocab };
};

// Perform the search
export const performSearch = (
  query: string,
  chunks: VectorChunk[],
  vectors: number[][],
  vocab: Map<string, number>
): { chunk: VectorChunk; score: number }[] => {
  if (!query.trim()) {
    return [];
  }
  const queryTokens = tokenize(query);
  const queryVector = createTfVector(queryTokens, vocab);

  const results = chunks.map((chunk, index) => ({
    chunk,
    score: cosineSimilarity(queryVector, vectors[index]),
  }));

  return results
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};