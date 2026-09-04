import { apiFetch } from '@/lib/api-client';

export interface AssistantChatPayload {
  message: string;
  page?: string;
  workflow?: string;
  recent_actions?: string[];
  navigation_links?: string[];
}

export interface AssistantChatResponse {
  answer: string;
  fallback_used: boolean;
}

export const aiAssistantService = {
  chat: (payload: AssistantChatPayload) =>
    apiFetch<AssistantChatResponse>('/api/ai-assistant/chat', {
      method: 'POST',
      body: payload,
    }),
};
