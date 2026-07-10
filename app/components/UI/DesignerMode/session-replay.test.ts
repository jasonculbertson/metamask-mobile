import {
  getActiveScreenName,
  resetSessionReplayDedupe,
  sanitizeScreenName,
  sendNavigationEvent,
} from './session-replay';

jest.mock('../../../core/NavigationService', () => ({
  __esModule: true,
  default: {
    navigation: {
      getRootState: jest.fn(),
    },
  },
}));

import NavigationService from '../../../core/NavigationService';

describe('session-replay', () => {
  beforeEach(() => {
    resetSessionReplayDedupe();
    jest.clearAllMocks();
  });

  describe('sanitizeScreenName', () => {
    it('strips unsafe characters', () => {
      expect(sanitizeScreenName('Wallet/View#1')).toBe('Wallet/View1');
    });

    it('falls back to Unknown for empty input', () => {
      expect(sanitizeScreenName('   ')).toBe('Unknown');
    });
  });

  describe('getActiveScreenName', () => {
    it('returns deepest route name', () => {
      (NavigationService.navigation.getRootState as jest.Mock).mockReturnValue({
        index: 0,
        routes: [
          {
            name: 'Main',
            state: {
              index: 0,
              routes: [{ name: 'WalletView' }],
            },
          },
        ],
      });
      expect(getActiveScreenName()).toBe('WalletView');
    });

    it('returns undefined when navigation is unavailable', () => {
      (
        NavigationService.navigation.getRootState as jest.Mock
      ).mockImplementation(() => {
        throw new Error('no nav');
      });
      expect(getActiveScreenName()).toBeUndefined();
    });
  });

  describe('sendNavigationEvent', () => {
    it('posts screen name to relay', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock as unknown as typeof fetch;

      await sendNavigationEvent('http://127.0.0.1:3334', 'SendFlow');
      await sendNavigationEvent('http://127.0.0.1:3334', 'SendFlow');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3334/api/navigation',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('SendFlow'),
        }),
      );
    });
  });
});
