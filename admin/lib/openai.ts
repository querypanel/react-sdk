import { VisualizationResponse } from './prompts';

export interface OpenAIResponse {
  message: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIRequest {
  message: string;
}

/**
 * Call OpenAI API through our backend endpoint
 */
export async function callOpenAI(request: OpenAIRequest): Promise<OpenAIResponse> {
  const response = await fetch('/api/openai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to call OpenAI API');
  }

  return response.json();
}

/**
 * Call OpenAI API for data visualization and parse the JSON response
 */
export async function callOpenAIForVisualization(message: string): Promise<VisualizationResponse> {
  const response = await callOpenAI({ message }) as unknown as VisualizationResponse;
  try {
    // Validate that it has the expected structure
    if (!response.data || !response.visualization || !response.explanation) {
      throw new Error('Invalid visualization response format');
    }
    
    return response;
  } catch (error) {
    throw new Error(`Failed to parse visualization response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Call OpenAI API with streaming response
 */
export async function callOpenAIStream(
  request: Omit<OpenAIRequest, 'stream'>,
  onChunk: (content: string) => void
): Promise<void> {
  const response = await fetch('/api/openai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...request, stream: true }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to call OpenAI API');
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('No response body');
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              onChunk(parsed.content);
            }
          } catch {
            // Ignore parsing errors for malformed chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
} 