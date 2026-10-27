import { render } from '@testing-library/react-native';
import AiScreen from '../app/(tabs)/ai';
import { aiService } from '../services/ai.service';
import api from '../services/api';

test('disabled AI service refuses personal content before making an HTTP request', async () => {
  const post = jest.spyOn(api, 'post');
  await expect(aiService.chat([{ role: 'user', content: 'private task' }])).rejects.toThrow('AI_DISABLED');
  expect(post).not.toHaveBeenCalled();
  post.mockRestore();
});

test('AI deep link cannot mount a chat or send messages', async () => {
  const chat = jest.spyOn(aiService, 'chat');
  const view = await render(<AiScreen />);
  expect(view.toJSON()).toBeNull();
  expect(chat).not.toHaveBeenCalled();
  chat.mockRestore();
});
