import { 
  GoogleGenAI, 
  Chat, 
  GenerateContentResponse, 
  FunctionDeclaration, 
  Type,
  FunctionCall,
  FunctionResponse,
  Content
} from "@google/genai";
import { ToolName, Message } from "../types";

const SYSTEM_INSTRUCTION = `You are Reena, a SUPER-TALENTED assistant. Speak fluently in Nepali and English; prefer Nepali when user writes Nepali.
Behaviors:
- Be accurate, concise, and explain reasoning steps when asked.
- When solving multi-step problems, show numbered steps and intermediate calculations.
- When asked to write code, provide runnable code blocks, brief explanation, and test examples.
- If you are unsure, say you’re unsure and list assumptions; do not hallucinate facts.
- Respect user privacy; never request or store secrets (API keys, passwords) in chat.
- For potentially harmful requests, refuse and offer safe alternatives.
- For factual queries, prefer citing sources when available.
Style:
- Polite, slightly informal, helpful. Use Nepali mixed with English where appropriate.
Memory & Context:
- Use the previous messages as context. If user asks to "remember" something, ask whether to save to long-term memory.
Tooling:
- If a tool is available (calculator, time), call it.`;

// 1. Define Tool Declarations (Google SDK format)
const calculatorTool: FunctionDeclaration = {
  name: ToolName.CALCULATOR,
  description: "Perform mathematical calculations. Use this for any math request.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      expression: {
        type: Type.STRING,
        description: "The mathematical expression to evaluate (e.g., '2 + 2 * 5', 'sqrt(16)').",
      },
    },
    required: ["expression"],
  },
};

const timeTool: FunctionDeclaration = {
  name: ToolName.GET_TIME,
  description: "Get the current local time.",
  parameters: {
    type: Type.OBJECT,
    properties: {}, 
  },
};

// 2. Define Tool Implementations
const executeCalculator = (expression: string): string => {
  try {
    const sanitized = expression.replace(/[^0-9+\-*/().\sMathsincostanlogsqrt]/g, '');
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${sanitized}`)();
    return JSON.stringify({ result });
  } catch (error) {
    return JSON.stringify({ error: "Invalid expression" });
  }
};

const executeGetTime = (): string => {
  return JSON.stringify({ time: new Date().toLocaleString() });
};

// 3. Main Service Class
export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private chat: Chat | null = null;
  private apiKey: string;
  private isOpenRouter: boolean = false;
  private openRouterHistory: { role: string, content: string }[] = [];

  constructor() {
    this.apiKey = process.env.API_KEY || "";
    
    // Check if it's an OpenRouter key
    if (this.apiKey.startsWith("sk-or-v1")) {
      this.isOpenRouter = true;
      console.log("Reena Bot: OpenRouter Key detected. Switching to OpenRouter API.");
    } else if (this.apiKey) {
      // Standard Google Key
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
      this.chat = this.createChatInstance([]);
    }
  }

  // Helper to create a chat instance with optional history (Google SDK)
  private createChatInstance(history: Content[]): Chat {
    if (!this.ai) throw new Error("Google SDK not initialized");
    return this.ai.chats.create({
      model: 'gemini-3-pro-preview',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: [calculatorTool, timeTool] }],
        temperature: 0.7,
      },
      history: history
    });
  }

  // Re-initialize the chat with a specific history
  public startChat(messages: Message[]) {
    if (this.isOpenRouter) {
      // For OpenRouter, we just convert and store the array
      this.openRouterHistory = messages
        .filter(m => !m.isError)
        .map(m => {
          let role = m.role === 'model' ? 'assistant' : m.role;
          if (role === 'system') role = 'system'; // keep system
          return {
            role: role,
            content: m.content
          };
        });
      
      // Ensure system instruction is present for OpenRouter
      const hasSystem = this.openRouterHistory.some(m => m.role === 'system');
      if (!hasSystem) {
        this.openRouterHistory.unshift({ role: 'system', content: SYSTEM_INSTRUCTION });
      }

    } else {
      // Google SDK Logic
      if (!this.ai) return; // Wait for init or error in sendMessage

      const history: Content[] = messages
        .filter(m => m.role !== 'system' && !m.isError)
        .map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        }));
      
      if (history.length > 0 && history[0].role === 'model') {
         history.shift();
      }

      this.chat = this.createChatInstance(history);
    }
  }

  async sendMessage(message: string): Promise<AsyncGenerator<string, void, unknown>> {
    if (!this.apiKey) {
      throw new Error("API Key is missing. Please check your .env file or Vercel settings.");
    }

    if (this.isOpenRouter) {
      return this.sendOpenRouterMessage(message);
    } else {
      return this.sendGoogleMessage(message);
    }
  }

  // --- OpenRouter Implementation ---
  private async *sendOpenRouterMessage(message: string): AsyncGenerator<string, void, unknown> {
    // Add user message to history
    this.openRouterHistory.push({ role: 'user', content: message });

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://reena-chat.vercel.app", // Optional: required by OpenRouter for ranking
          "X-Title": "Reena Chat Bot"
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001", // Using a reliable Gemini model on OpenRouter
          messages: this.openRouterHistory,
          stream: true
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter Error: ${err}`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            
            try {
              const json = JSON.parse(data);
              const content = json.choices[0]?.delta?.content;
              if (content) {
                accumulatedText += content;
                yield accumulatedText;
              }
            } catch (e) {
              // ignore parse errors for partial chunks
            }
          }
        }
      }

      // Update history with the full response
      this.openRouterHistory.push({ role: 'assistant', content: accumulatedText });

    } catch (error) {
      console.error("OpenRouter Error:", error);
      throw error;
    }
  }

  // --- Google SDK Implementation ---
  private async *sendGoogleMessage(message: string): AsyncGenerator<string, void, unknown> {
    if (!this.chat) {
       // Try to re-init if key exists
       this.ai = new GoogleGenAI({ apiKey: this.apiKey });
       this.chat = this.createChatInstance([]);
    }

    try {
      let response = await this.chat.sendMessageStream({ message });
      
      let accumulatedText = "";
      let functionCalls: FunctionCall[] = [];

      for await (const chunk of response) {
        if (chunk.text) {
          accumulatedText += chunk.text;
          yield accumulatedText;
        }
        
        const candidates = chunk.candidates;
        if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.functionCall) {
              functionCalls.push(part.functionCall);
            }
          }
        }
      }

      if (functionCalls.length > 0) {
        yield accumulatedText + "\n\n*Processing tool...*";
        
        const functionResponses: FunctionResponse[] = [];

        for (const call of functionCalls) {
          let result = "";
          if (call.name === ToolName.CALCULATOR) {
            const args = call.args as { expression: string };
            result = executeCalculator(args.expression);
          } else if (call.name === ToolName.GET_TIME) {
            result = executeGetTime();
          }

          functionResponses.push({
            id: call.id,
            name: call.name,
            response: { result },
          });
        }

        const toolResponseParts = functionResponses.map(fr => ({
          functionResponse: fr
        }));
        
        const nextStream = await this.chat.sendMessageStream({
          message: toolResponseParts
        });

        for await (const chunk of nextStream) {
           if (chunk.text) {
             accumulatedText += chunk.text;
             yield accumulatedText;
           }
        }
      }
    } catch (error) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }
}