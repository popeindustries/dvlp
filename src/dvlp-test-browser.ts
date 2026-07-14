import { testBrowser } from './test-browser/index.ts';

export { testBrowser };
export type {
  MockPushEvent,
  MockPushStream,
  MockRequest,
  MockResponse,
  MockResponseHandler,
} from './mock/types.ts';
export type { PushEvent } from './push-events/types.ts';

declare global {
  interface Window {
    dvlp: typeof testBrowser;
  }
}
