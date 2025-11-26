import { describe, it, expect, beforeEach } from 'vitest';
import { ChatbotService } from '../../src/services/chatbot.js';

describe('ChatbotService', () => {
  let chatbot: ChatbotService;

  beforeEach(() => {
    chatbot = new ChatbotService();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      expect(chatbot).toBeDefined();
    });

    it('should create service with custom config', () => {
      const customChatbot = new ChatbotService({
        useColor: false,
        prompt: 'Custom',
      });
      expect(customChatbot).toBeDefined();
    });
  });

  describe('sendMessage', () => {
    it('should send message programmatically', async () => {
      const handler = async (message: string) => {
        return `Echo: ${message}`;
      };

      const response = await chatbot.sendMessage('Hello', handler);
      expect(response).toBe('Echo: Hello');
    });

    it('should handle errors in message handler', async () => {
      const handler = async () => {
        throw new Error('Handler error');
      };

      await expect(chatbot.sendMessage('Test', handler)).rejects.toThrow(
        'Handler error'
      );
    });

    it('should track message history', async () => {
      const handler = async (message: string) => `Response to: ${message}`;

      await chatbot.sendMessage('Message 1', handler);
      await chatbot.sendMessage('Message 2', handler);

      // Access private field for testing
      const history = (chatbot as any).messageHistory;
      expect(history).toHaveLength(2);
      expect(history[0]).toBe('Message 1');
      expect(history[1]).toBe('Message 2');
    });
  });

  describe('stop', () => {
    it('should stop gracefully when not running', async () => {
      await expect(chatbot.stop()).resolves.not.toThrow();
    });
  });
});
