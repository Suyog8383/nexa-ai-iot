/**
 * Mock Nexa AI responder. Swap `askNexa` for a real model call (e.g. a backend
 * endpoint that grounds Claude on the device's telemetry) without touching the UI.
 */
import { seededConversation } from '@/data/mock';
import type { ChatMessage } from '@/data/types';

const seededReply = seededConversation.find((m) => m.role === 'assistant')!;

const canned: { match: RegExp; reply: () => Omit<Extract<ChatMessage, { role: 'assistant' }>, 'id'> }[] = [
  {
    match: /drop|6\s?(:00)?\s?am/i,
    reply: () => ({ ...seededReply, role: 'assistant' }),
  },
  {
    match: /humidity/i,
    reply: () => ({
      role: 'assistant',
      text: 'Yes. Relative humidity has stayed between 42% and 48% today, inside your healthy 40%–60% range. It is currently 45% RH.',
    }),
  },
  {
    match: /peak|highest|max/i,
    reply: () => ({
      role: 'assistant',
      text: 'The peak temperature in the past 24 hours was 22.1°C at 2:00 PM, still within your 20.0°–23.0°C comfort corridor.',
    }),
  },
];

export async function askNexa(question: string): Promise<Omit<Extract<ChatMessage, { role: 'assistant' }>, 'id'>> {
  await new Promise((r) => setTimeout(r, 900));
  const hit = canned.find((c) => c.match.test(question));
  return hit
    ? hit.reply()
    : {
        role: 'assistant',
        text: 'Your Living Room Monitor reports 21.5°C and 45% RH right now, both within your comfort thresholds. Ask about trends, peaks or alerts for more detail.',
      };
}
