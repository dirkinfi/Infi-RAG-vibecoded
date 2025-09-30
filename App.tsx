

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { VectorChunk, SummaryData } from './types';
import FileUploader from './components/FileUploader';
import SummaryDisplay from './components/SummaryDisplay';
import ChunkTable from './components/ChunkTable';
import VectorSearch from './components/VectorSearch';
import { InfoIcon, CogIcon, ChatBubbleLeftRightIcon, PaperAirplaneIcon, TrashIcon, PlusIcon } from './components/icons';
import { GoogleGenAI } from "@google/genai";
import { performSearch, precomputeVectors } from './lib/cosine-similarity';
import { getVectorStore, saveVectorData, deleteVectorStore, getAllVectorStoresMeta } from './lib/db';


interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: VectorChunk[];
  query?: string; // The full prompt sent to the model
  exampleQuestions?: string[];
}

const initialChatMessage: ChatMessage = {
  role: 'model',
  text: "Hi there! I'm ready to answer questions about your uploaded document. What would you like to know?",
  exampleQuestions: [
    'Where can I have lunch?',
    'What are Design Parties I can reach out to?',
    'How can I use the big red button?',
  ]
};

const App: React.FC = () => {
  const [vectorData, setVectorData] = useState<VectorChunk[] | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setProcessing] = useState<boolean>(true); // Used for multiple loading states
  const [persistenceStatus, setPersistenceStatus] = useState<string | null>(null);

  const [limit, setLimit] = useState<number>(3);
  const [width, setWidth] = useState<number>(200);
  const [embeddingModel, setEmbeddingModel] = useState<string>("qwen3-coder:480b-cloud");
  
  const [activeTab, setActiveTab] = useState<'prepare' | 'chat'>('prepare');
  
  const [precomputedData, setPrecomputedData] = useState<{ vectors: number[][]; vocab: Map<string, number> } | null>(null);

  // New state for multi-store management
  const [availableStores, setAvailableStores] = useState<{id: number, fileName: string}[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isReplying, setIsReplying] = useState<boolean>(false);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState<number | null>(null);
  const [sourceViewMode, setSourceViewMode] = useState<'preview' | 'full'>('preview');
  const [queryViewMode, setQueryViewMode] = useState<'preview' | 'full'>('preview');
  const [responseViewMode, setResponseViewMode] = useState<'preview' | 'full'>('preview');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const truncateText = (text: string, length: number) => {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
  };
  
  useEffect(() => {
    if (selectedMessageIndex !== null) {
      setSourceViewMode('preview');
      setQueryViewMode('preview');
      setResponseViewMode('preview');
    }
  }, [selectedMessageIndex]);


  const validateAndProcessData = useCallback((data: any): { processedData: VectorChunk[], summaryData: SummaryData } => {
    if (!Array.isArray(data)) {
      throw new Error('Invalid JSON format: Top-level structure is not a list.');
    }

    for (const item of data) {
      if (typeof item !== 'object' || item === null) {
        throw new Error('Invalid item in list: Found a non-object value.');
      }
      if (typeof item.id !== 'string') {
        throw new Error(`Invalid item field 'id': Expected string, got ${typeof item.id}. Item: ${JSON.stringify(item)}`);
      }
      if (typeof item.source !== 'string') {
        throw new Error(`Invalid item field 'source': Expected string, got ${typeof item.source}. Item: ${JSON.stringify(item)}`);
      }
      if (typeof item.text !== 'string') {
        throw new Error(`Invalid item field 'text': Expected string, got ${typeof item.text}. Item: ${JSON.stringify(item)}`);
      }
      if (typeof item.startIndex !== 'number') {
        throw new Error(`Invalid item field 'startIndex': Expected number, got ${typeof item.startIndex}. Item: ${JSON.stringify(item)}`);
      }
    }
    
    const typedData = data as VectorChunk[];
    
    const sourceCounts: { [key: string]: number } = {};
    let totalTextLength = 0;
    typedData.forEach(chunk => {
      sourceCounts[chunk.source] = (sourceCounts[chunk.source] || 0) + 1;
      totalTextLength += chunk.text.length;
    });

    const sortedSources = Object.entries(sourceCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    const summaryData = {
      totalChunks: typedData.length,
      uniqueSources: Object.keys(sourceCounts).length,
      topSources: sortedSources,
      totalTextLength: totalTextLength,
    };

    return { processedData: typedData, summaryData };
  }, []);

  const clearLoadedData = useCallback(() => {
    setVectorData(null);
    setSummary(null);
    setError(null);
    setFileName('');
    setChatHistory([]);
    setSelectedMessageIndex(null);
    setPrecomputedData(null);
  }, []);
  
  // Load list of stores from IndexedDB on initial component mount
  useEffect(() => {
    const loadFromDB = async () => {
      setProcessing(true);
      try {
        const storesMeta = await getAllVectorStoresMeta();
        setAvailableStores(storesMeta);
        
        const lastSelectedId = localStorage.getItem('lastSelectedStoreId');
        if (lastSelectedId && storesMeta.some(s => s.id === Number(lastSelectedId))) {
          setSelectedStoreId(Number(lastSelectedId));
        } else if (storesMeta.length > 0) {
            setSelectedStoreId(storesMeta[0].id); // Select the most recent one
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        setError(`Error loading from local storage: ${errorMsg}`);
      } finally {
        setProcessing(false);
      }
    };
    loadFromDB();
  }, []);

  // Effect to load a vector store when its ID is selected
  useEffect(() => {
    const loadStoreContent = async () => {
      if (selectedStoreId === null) {
        clearLoadedData();
        return;
      }
      
      setProcessing(true);
      clearLoadedData();
      localStorage.setItem('lastSelectedStoreId', String(selectedStoreId));

      try {
        const storedData = await getVectorStore(selectedStoreId);
        if (storedData) {
          const { processedData, summaryData } = validateAndProcessData(storedData.content);
          setFileName(storedData.fileName);
          setVectorData(processedData);
          setSummary(summaryData);
        } else {
            throw new Error('Selected store not found in the database.');
        }
      } catch(e) {
          const errorMsg = e instanceof Error ? e.message : 'Unknown error';
          setError(`Error loading store: ${errorMsg}`);
          setSelectedStoreId(null);
          localStorage.removeItem('lastSelectedStoreId');
      } finally {
          setProcessing(false);
      }
    };

    loadStoreContent();
  }, [selectedStoreId, validateAndProcessData, clearLoadedData]);


  useEffect(() => {
    if (vectorData) {
      const data = precomputeVectors(vectorData);
      setPrecomputedData(data);
      setChatHistory([initialChatMessage]);
    } else {
      setPrecomputedData(null);
      setChatHistory([]);
    }
  }, [vectorData]);
  
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isReplying]);


  const handleFileSelect = useCallback(async (file: File) => {
    clearLoadedData();
    setProcessing(true);
    setPersistenceStatus(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (event: ProgressEvent<FileReader>) => {
      try {
        if (typeof event.target?.result !== 'string') {
          throw new Error('Failed to read file content.');
        }
        const parsedData = JSON.parse(event.target.result);
        validateAndProcessData(parsedData); // Validate before saving
        
        const newId = await saveVectorData(file.name, parsedData);
        
        setAvailableStores(prev => [{ id: newId, fileName: file.name }, ...prev].sort((a,b) => b.id - a.id));
        setSelectedStoreId(newId); // This will trigger the useEffect to load the data

        setPersistenceStatus('New vector store saved to local storage.');
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'An unknown error occurred.';
        setError(`Error processing file: ${errorMsg}`);
        setProcessing(false);
      }
    };
    reader.onerror = () => {
      setError('Error reading the file.');
      setProcessing(false);
    };
    reader.readAsText(file);
  }, [clearLoadedData, validateAndProcessData]);

  const handleClearData = async () => {
    if (!selectedStoreId) return;

    try {
      const storeToDelete = availableStores.find(s => s.id === selectedStoreId);
      await deleteVectorStore(selectedStoreId);
      
      const newStores = availableStores.filter(s => s.id !== selectedStoreId);
      setAvailableStores(newStores);

      if (newStores.length > 0) {
        setSelectedStoreId(newStores[0].id); // Select the newest remaining store
      } else {
        setSelectedStoreId(null);
        clearLoadedData();
        localStorage.removeItem('lastSelectedStoreId');
      }
      
      setPersistenceStatus(`Store '${storeToDelete?.fileName || ''}' deleted.`);
      setTimeout(() => setPersistenceStatus(null), 3000);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      setError(`Error clearing local storage: ${errorMsg}`);
    }
  };

  const handleResetChat = useCallback(() => {
    setChatHistory([initialChatMessage]);
    setSelectedMessageIndex(null);
  }, []);
  
  const handleSendMessage = async (queryOverride?: string) => {
    const query = queryOverride || chatInput;
    if (!query.trim() || !vectorData || !precomputedData || isReplying) return;

    const userMessage: ChatMessage = { role: 'user', text: query };
    setChatHistory(prev => [...prev, userMessage]);
    setChatInput('');
    setIsReplying(true);

    try {
      const searchResults = performSearch(query, vectorData, precomputedData.vectors, precomputedData.vocab);
      const contextChunks = searchResults.slice(0, 3);
      const contextText = contextChunks.length > 0
        ? contextChunks.map(r => r.chunk.text).join('\n\n---\n\n')
        : "No relevant context found.";

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const systemInstructionWithContext = `Based on the context provided below, answer the user's question in English. If the context doesn't contain the answer, say you cannot answer based on the provided information.

Context:
${contextText}`;

      const historyForApi = chatHistory
        .filter(msg => !msg.exampleQuestions) // Exclude the initial greeting
        .map(msg => ({
          role: msg.role,
          parts: [{ text: msg.text }],
        }));
      
      historyForApi.push({ role: 'user', parts: [{ text: query }] });
      
      const fullQueryForDisplay = `SYSTEM INSTRUCTION:\n${systemInstructionWithContext}\n\n----------\n\nCHAT HISTORY (contents):\n${JSON.stringify(historyForApi, null, 2)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: historyForApi,
        config: {
          systemInstruction: systemInstructionWithContext,
        },
      });

      const modelResponseText = response.text;

      const modelMessage: ChatMessage = {
        role: 'model',
        text: modelResponseText,
        sources: contextChunks.map(c => c.chunk),
        query: fullQueryForDisplay,
      };
      setChatHistory(prev => [...prev, modelMessage]);

    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'An unknown error occurred.';
      const errorMessage: ChatMessage = {
          role: 'model',
          text: `Sorry, I encountered an error: ${errorMsg}`
      };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsReplying(false);
    }
  };


  const TabButton: React.FC<{
    isActive: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    disabled?: boolean;
  }> = ({ isActive, onClick, icon, label, disabled = false }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group inline-flex items-center justify-center px-4 py-3 border-b-2 font-medium text-sm transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50 ${
        isActive
          ? 'border-indigo-500 text-indigo-400'
          : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className={`mr-2 w-5 h-5 ${isActive ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}`}>{icon}</span>
      {label}
    </button>
  );

  const renderInitialLoader = () => (
     <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
          Infi RAG - vibecoded
        </h1>
        <p className="mt-4 text-lg text-indigo-400">Loading application...</p>
      </div>
    </div>
  );

  if (isProcessing && availableStores.length === 0 && !selectedStoreId) {
    return renderInitialLoader();
  }

  const ViewModeToggle: React.FC<{
    viewMode: 'preview' | 'full';
    setViewMode: (mode: 'preview' | 'full') => void;
  }> = ({ viewMode, setViewMode }) => (
    <div className="flex items-center bg-gray-700 rounded-lg p-1">
        <button
            onClick={() => setViewMode('preview')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'preview' ? 'bg-indigo-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600/50'}`}
            aria-pressed={viewMode === 'preview'}
        >
            Preview
        </button>
        <button
            onClick={() => setViewMode('full')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'full' ? 'bg-indigo-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600/50'}`}
            aria-pressed={viewMode === 'full'}
        >
            Full text
        </button>
    </div>
  );

  const selectedMessage = selectedMessageIndex !== null ? chatHistory[selectedMessageIndex] : null;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 sm:p-8">
      <header className="text-center mb-10">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
          Infi RAG - vibecoded
        </h1>
        <p className="mt-2 text-lg text-gray-400">
          Upload and analyze your <code>vectorstore.json</code> file.
        </p>
      </header>

      <main>
         <div className="border-b border-gray-700 mb-8 flex justify-center">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
              <TabButton isActive={activeTab === 'prepare'} onClick={() => setActiveTab('prepare')} icon={<CogIcon />} label="Prepare" />
              <TabButton isActive={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<ChatBubbleLeftRightIcon />} label="Chat" disabled={!vectorData}/>
            </nav>
          </div>

          <div>
            {activeTab === 'prepare' && (
              <>
                 <div className="w-full max-w-3xl mx-auto mb-8">
                    <h2 className="text-xl font-bold text-white mb-4">Available Vector Stores</h2>
                    {availableStores.length > 0 ? (
                      <div className="bg-gray-800 rounded-xl shadow-lg p-2 max-h-60 overflow-y-auto">
                        <ul className="divide-y divide-gray-700">
                          {availableStores.map(store => (
                            <li
                              key={store.id}
                              onClick={() => setSelectedStoreId(store.id)}
                              className={`p-3 rounded-md cursor-pointer transition-colors duration-200 ${selectedStoreId === store.id ? 'bg-indigo-900/50' : 'hover:bg-gray-700/50'}`}
                            >
                              <div>
                                <p className={`font-medium ${selectedStoreId === store.id ? 'text-indigo-300' : 'text-white'}`}>{store.fileName}</p>
                                <p className="text-xs text-gray-400">{new Date(store.id).toLocaleString()}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      !isProcessing && (
                         <div className="bg-gray-800 rounded-xl shadow-lg p-6 text-center">
                           <p className="text-gray-500">No vector stores found. Upload a file to get started.</p>
                         </div>
                      )
                    )}
                 </div>

                 <FileUploader onFileSelect={handleFileSelect} setProcessing={setProcessing} />
                
                {isProcessing && vectorData === null && (
                  <div className="text-center mt-6 text-indigo-400" role="status">
                    Processing...
                  </div>
                )}

                {error && (
                  <div className="w-full max-w-3xl mx-auto mt-6 bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-lg relative" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{error}</span>
                  </div>
                )}

                {!isProcessing && vectorData && summary && precomputedData && (
                  <div className="mt-8 animate-fade-in">
                    <div className="w-full max-w-5xl mx-auto flex justify-between items-center -mt-2 mb-6">
                      {persistenceStatus ? (
                        <p className="text-sm text-green-400">{persistenceStatus}</p>
                      ) : <div />}
                       <button
                          onClick={handleClearData}
                          disabled={!selectedStoreId}
                          className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-red-400 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Clear stored data"
                        >
                          <TrashIcon className="w-4 h-4" />
                          <span>Clear Stored Data</span>
                        </button>
                    </div>
                    
                    <div className="w-full max-w-5xl mx-auto bg-gray-800 p-6 rounded-xl shadow-lg flex items-start space-x-4 mb-8">
                      <InfoIcon className="w-8 h-8 text-sky-400 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="text-lg font-semibold text-white">Display & Search Controls</h3>
                        <div className="flex flex-wrap gap-x-6 gap-y-4 mt-2">
                          <div className="flex items-center space-x-2">
                            <label htmlFor="limit" className="text-sm font-medium text-gray-300">Preview Limit:</label>
                            <input
                              type="number"
                              id="limit"
                              value={limit}
                              onChange={(e) => setLimit(Math.min(50, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                              className="bg-gray-700 text-white rounded-md p-1 w-20 border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              min="0"
                              max="50"
                              aria-label="Number of chunks to preview"
                            />
                          </div>
                           <div className="flex items-center space-x-2">
                            <label htmlFor="width" className="text-sm font-medium text-gray-300">Text Width:</label>
                            <input
                              type="number"
                              id="width"
                              value={width}
                              onChange={(e) => setWidth(Math.max(20, parseInt(e.target.value, 10) || 20))}
                              className="bg-gray-700 text-white rounded-md p-1 w-24 border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              min="20"
                              step="10"
                              aria-label="Character width for text truncation"
                            />
                          </div>
                          <div className="flex items-center space-x-2 relative group">
                            <label htmlFor="embedding-model" className="text-sm font-medium text-gray-300">Embedding Model:</label>
                            <input
                              type="text"
                              id="embedding-model"
                              value={embeddingModel}
                              onChange={(e) => setEmbeddingModel(e.target.value)}
                              className="bg-gray-700 text-white rounded-md p-1 w-48 border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              aria-label="Embedding model name"
                            />
                            <div className="absolute left-0 -bottom-12 w-64 p-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" role="tooltip">
                              This is for display purposes. The actual search uses a simplified in-browser term-frequency model, not a real embeddings model.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <SummaryDisplay summary={summary} fileName={fileName} />
                    {vectorData.length > 0 && <VectorSearch chunks={vectorData} embeddingModel={embeddingModel} width={width} vectors={precomputedData.vectors} vocab={precomputedData.vocab} />}
                    <ChunkTable chunks={vectorData} limit={limit} width={width} />
                  </div>
                )}
              </>
            )}
            {activeTab === 'chat' && (
              <div className="w-full max-w-7xl mx-auto mt-2 animate-fade-in grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 flex flex-col h-[70vh] bg-gray-800 rounded-xl shadow-lg">
                  <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">Chat</h3>
                    <button
                      onClick={handleResetChat}
                      className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg border border-gray-600 hover:bg-gray-600 hover:text-white transition-colors"
                      aria-label="New Chat"
                    >
                      <PlusIcon className="w-4 h-4" />
                      <span>New Chat</span>
                    </button>
                  </div>
                  <div className="flex-grow p-6 space-y-6 overflow-y-auto">
                    {chatHistory.map((msg, index) => (
                      <div key={index} className="flex items-start gap-3">
                         <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs ${msg.role === 'user' ? 'bg-gray-600' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
                          {msg.role === 'user' ? 'You' : 'AI'}
                        </div>
                        <div className={`max-w-lg p-4 rounded-xl ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          {msg.sources && msg.sources.length > 0 && (
                            <button
                                onClick={() => setSelectedMessageIndex(index === selectedMessageIndex ? null : index)}
                                className="mt-3 text-xs font-semibold text-indigo-300 hover:text-indigo-200 focus:outline-none underline"
                                aria-label={`View details for message ${index + 1}`}
                            >
                                {index === selectedMessageIndex ? 'Hide details' : 'View details'}
                            </button>
                          )}
                           {index === 0 && msg.role === 'model' && msg.exampleQuestions && (
                            <div className="mt-4 flex flex-col items-start gap-2">
                              {msg.exampleQuestions.map((q, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleSendMessage(q)}
                                  disabled={isReplying}
                                  className="text-left text-sm text-indigo-300 bg-gray-900/40 px-3 py-2 rounded-lg hover:bg-gray-900/70 hover:text-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isReplying && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">AI</div>
                        <div className="max-w-md p-4 rounded-xl bg-gray-700 text-gray-200">
                          <div className="flex items-center space-x-2 text-gray-400">
                            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></span>
                            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }}></span>
                            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="p-4 border-t border-gray-700">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ask a question about your document..."
                        className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                        aria-label="Chat input"
                        disabled={isReplying}
                      />
                      <button
                        onClick={() => handleSendMessage()}
                        disabled={isReplying || !chatInput.trim()}
                        className="bg-indigo-600 text-white font-semibold p-3 rounded-lg hover:bg-indigo-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                        aria-label="Send message"
                      >
                        <PaperAirplaneIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2">
                    <div className="bg-gray-800 rounded-xl shadow-lg p-6 sticky top-8">
                        <div className="mb-6 pb-6 border-b border-gray-700">
                            <h3 className="text-xl font-bold text-white mb-4">Vectorstore</h3>
                            {availableStores.length > 0 ? (
                                <select
                                    value={selectedStoreId || ''}
                                    onChange={(e) => {
                                        const newId = Number(e.target.value);
                                        if (newId) {
                                            setSelectedStoreId(newId);
                                        }
                                    }}
                                    className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                                    aria-label="Select active vector store"
                                >
                                    {availableStores.map(store => (
                                        <option key={store.id} value={store.id}>
                                            {store.fileName} ({new Date(store.id).toLocaleString()})
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-gray-500 text-sm">No vector stores available. Go to the 'Prepare' tab to upload one.</p>
                            )}
                        </div>

                        <h3 className="text-xl font-bold text-white mb-4">Interaction Details</h3>
                        {selectedMessage && selectedMessage.role === 'model' ? (
                            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                                {/* Query and Response Section */}
                                <div className="space-y-4">
                                  {/* Query */}
                                  {selectedMessage.query && (
                                    <div>
                                      <div className="flex justify-between items-center mb-2">
                                        <h5 className="font-semibold text-gray-300">Query</h5>
                                        <ViewModeToggle viewMode={queryViewMode} setViewMode={setQueryViewMode} />
                                      </div>
                                      <div className="text-xs p-3 bg-gray-700 rounded-lg">
                                        <p className="font-mono text-gray-300 whitespace-pre-wrap break-words">
                                            {queryViewMode === 'preview' ? truncateText(selectedMessage.query, 200) : selectedMessage.query}
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Response */}
                                  <div>
                                    <div className="flex justify-between items-center mb-2">
                                      <h5 className="font-semibold text-gray-300">Response</h5>
                                      <ViewModeToggle viewMode={responseViewMode} setViewMode={setResponseViewMode} />
                                    </div>
                                      <div className="text-xs p-3 bg-gray-700 rounded-lg">
                                      <p className="font-mono text-gray-300 whitespace-pre-wrap break-words">
                                          {responseViewMode === 'preview' ? truncateText(selectedMessage.text, 200) : selectedMessage.text}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Sources Section */}
                                {selectedMessage.sources && selectedMessage.sources.length > 0 && (
                                  <div>
                                    <div className="flex justify-between items-center mb-4">
                                      <h4 className="text-lg font-semibold text-gray-200">Sources</h4>
                                      <ViewModeToggle viewMode={sourceViewMode} setViewMode={setSourceViewMode} />
                                    </div>
                                    <div className="space-y-3">
                                      {selectedMessage.sources.map(source => (
                                          <div key={source.id} className="text-xs p-3 bg-gray-700 rounded-lg">
                                              <p className="font-mono text-indigo-300 truncate font-semibold" title={source.source}>{source.source}</p>
                                              <p className="mt-1 font-mono text-gray-400">ID: {source.id}</p>
                                              <p className="mt-2 font-mono text-gray-300 whitespace-pre-wrap break-words">
                                                  {sourceViewMode === 'preview' ? `"${truncateText(source.text, 200)}"` : source.text}
                                              </p>
                                          </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <InfoIcon className="w-10 h-10 mx-auto mb-4" />
                                <p>Click "View details" on a message to see its sources and communication details.</p>
                            </div>
                        )}
                    </div>
                </div>
              </div>
            )}
          </div>
      </main>
      
      <footer className="text-center mt-12 text-gray-500 text-sm">
        <p>Built by a world-class senior frontend React engineer.</p>
      </footer>
    </div>
  );
};

export default App;
