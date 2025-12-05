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

// 1. Define Tool Declarations
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
    // Safety: In a real app, use a safer math parser. 
    // For this demo, we'll strip non-math chars and use Function constructor strictly.
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
  private ai: GoogleGenAI;
  private chat: Chat;

  constructor() {
    // Initialize inside constructor to handle missing keys gracefully at startup
    const apiKey = process.env.API_KEY || "";
    
    // Warning for debugging key issues
    if (apiKey && apiKey.startsWith("sk-")) {
      console.warn("WARNING: You seem to be using an OpenRouter/OpenAI key (starts with 'sk-') but this app uses the Google GenAI SDK. Requests will likely fail.");
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.chat = this.createChatInstance([]);
  }

  // Helper to create a chat instance with optional history
  private createChatInstance(history: Content[]): Chat {
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

  // Re-initialize the chat with a specific history (used when switching sessions)
  public startChat(messages: Message[]) {
    // Map internal Message format to SDK Content format
    const history: Content[] = messages
      .filter(m => m.role !== 'system' && !m.isError) // Filter out system UI messages and errors
      .map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
    
    // The API generally expects the history to start with a User message (or System, which is handled via config).
    // If our history starts with a Model message (e.g., welcome message), we should drop it from the API context
    // to avoid validation errors.
    if (history.length > 0 && history[0].role === 'model') {
       history.shift();
    }

    this.chat = this.createChatInstance(history);
  }

  async sendMessage(message: string): Promise<AsyncGenerator<string, void, unknown>> {
    if (!process.env.API_KEY) {
      throw new Error("API Key is missing. Please check your .env file or Vercel settings.");
    }

    try {
      // Send initial message
      let response = await this.chat.sendMessageStream({ message });
      
      return this.handleStreamLoop(response);

    } catch (error) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }

  private async *handleStreamLoop(
    stream: AsyncIterable<GenerateContentResponse>
  ): AsyncGenerator<string, void, unknown> {
    
    let accumulatedText = "";
    let functionCalls: FunctionCall[] = [];

    // 1. Consume the stream
    for await (const chunk of stream) {
      // Check for text
      if (chunk.text) {
        accumulatedText += chunk.text;
        yield accumulatedText;
      }
      
      // Check for function calls in this chunk
      const candidates = chunk.candidates;
      if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.functionCall) {
            functionCalls.push(part.functionCall);
          }
        }
      }
    }

    // 2. If we had function calls, we must execute them and send results back
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

      // Send tool responses back to model
      const toolResponseParts = functionResponses.map(fr => ({
        functionResponse: fr
      }));
      
      const nextStream = await this.chat.sendMessageStream({
        message: toolResponseParts
      });

      // Loop the new stream
      for await (const nextChunk of this.handleStreamLoop(nextStream)) {
         yield nextChunk; 
      }
    }
  }
}