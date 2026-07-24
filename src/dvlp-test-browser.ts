import { testBrowser } from './test-browser/index.ts';

export { testBrowser };
export type {
  MockedResponse,
  MockPushEvent,
  MockPushStream,
  MockRequest,
  MockRequestCall,
  MockResponse,
  MockResponseHandler,
} from './mock/types.ts';
export type {
  MockStream,
  MockStreamConnection,
  MockStreamContext,
  MockStreamOptions,
} from './test-browser/types.ts';
export type { PushEvent } from './push-events/types.ts';

declare global {
  interface Window {
    dvlp: typeof testBrowser;
  }
}
