export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  isError?: boolean;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
}

export enum ToolName {
  CALCULATOR = 'calculator',
  GET_TIME = 'get_time'
}