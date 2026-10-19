import type { ChatMessage } from '@/domain/types';
import { seededConversation, suggestedInquiries } from '@/mocks/fixtures';

import { resolved, type DataResult } from './result';

export type AssistantIntro = {
  /** Conversation shown when the assistant opens. */
  conversation: ChatMessage[];
  suggestions: typeof suggestedInquiries;
};

/** Starting state for the AI Assistant tab. Answers come from `services/assistant`. */
export function useAssistantIntro(): DataResult<AssistantIntro> {
  return resolved({ conversation: seededConversation, suggestions: suggestedInquiries });
}
