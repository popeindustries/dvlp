declare module 'server-destroy' {
  function destroy(server: import('http').Server): void;
  export = destroy;
}

declare module 'faye-websocket' {
  class PushClient {
    on(event: string, callback: (event: { data: string }) => void): void;
    send(msg: string, options?: PushEventOptions): void;
    removeAllListeners(): void;
    close(): void;
  }
  class EventSource extends PushClient {
    static isEventSource(eventSource: unknown): boolean;
    constructor(req: Req, res: Res, options: object);
  }
  class WebSocket extends PushClient {
    static isWebSocket(webSocket: unknown): boolean;
    static EventSource: EventSource;
    constructor(
      req: Req,
      socket: object,
      body: string,
      protocols: Array<object>,
      options: { extensions: Array<unknown> },
    );
  }
  export = WebSocket;
}

declare module 'permessage-deflate' {
  function deflate(): void;
  export = deflate;
}

declare module 'es-module-lexer' {
  function parse(
    code: string,
  ): Array<Array<{ d: number; e: number; s: number }>>;
}

declare module 'is-file-esm' {
  interface result {
    esm: boolean;
    type: string;
    extType: string;
    path: string;
    pkgPath: string;
  }
  function isFileEsm(
    path: string,
    cb: (err: string, result: result) => void,
  ): void;
  namespace isFileEsm {
    function sync(path: string): result;
  }

  // isFileEsm.sync = function (path: string): void {};
  export = isFileEsm;
}
