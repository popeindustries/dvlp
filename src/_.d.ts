declare interface Config {
  applicationFormat: 'cjs' | 'esm';
  applicationPort: number;
  brokenNamedExportsPackages: Record<string, Array<string>>;
  bundleDir: string;
  bundleDirName: string;
  directories: Array<string>;
  dvlpDir: string;
  esbuildTargetByExtension: {
    [extension: string]: string;
  };
  extensionsByType: {
    [type: string]: Array<string>;
  };
  latency: number;
  maxAge: string;
  port: number;
  reloadEndpoint: string;
  serverStartTimeout: number;
  sourceMapsDir: string;
  testing: boolean;
  typesByExtension: {
    [extension: string]: 'css' | 'html' | 'js';
  };
  version: string;
}

declare interface Entry {
  directories: Array<string>;
  isApp: boolean;
  isFunction: boolean;
  isStatic: boolean;
  main: string | (() => void) | undefined;
}

type Http2ServerRequest = import('http2').Http2ServerRequest;
type Http2ServerResponse = import('http2').Http2ServerResponse;
type IncomingMessage = import('http').IncomingMessage;
type ServerResponse = import('http').ServerResponse;
type HttpServer = import('http').Server;
type HttpsServer = import('https').Server;
type URL = import('url').URL;
type URLSearchParams = import('url').URLSearchParams;
type esbuild = {
  build(
    options: import('esbuild').BuildOptions & { write: false },
  ): Promise<import('esbuild').BuildResult & { outputFiles: import('esbuild').OutputFile[] }>;
  transform(input: string, options?: import('esbuild').TransformOptions): Promise<import('esbuild').TransformResult>;
};

type Req = (IncomingMessage | Http2ServerRequest) & {
  filePath: string;
  type: string;
  url: string;
  params?: { [key: string]: string } | {};
};
type Res = (ServerResponse | Http2ServerResponse) & {
  bundled: boolean;
  encoding: string;
  metrics: Metrics;
  mocked: boolean;
  transformed: boolean;
  unhandled: boolean;
  url: string;
  error?: Error;
};
type RequestHandler = (req: Req, res: Res) => void;
interface DestroyableHttpServer extends HttpServer {
  destroy(): void;
}
interface DestroyableHttpsServer extends HttpsServer {
  destroy(): void;
}
