declare interface Config {
  activePort: number;
  applicationLoaderURL: import('url').URL;
  brokenNamedExportsPackages: Record<string, Array<string>>;
  bundleDirMetaPath: string;
  bundleDirName: string;
  bundleDirPath: string;
  defaultPort: number;
  directories: Array<string>;
  dirPath: string;
  dvlpDirPath: string;
  electronEntryURL: import('url').URL;
  esbuildTargetByExtension: {
    [extension: string]: string;
  };
  extensionsByType: {
    [type: string]: Array<string>;
  };
  jsMimeTypes: Record<string, Array<string>>;
  latency: number;
  maxAge: string;
  reloadEndpoint: string;
  serverStartTimeout: number;
  testing: boolean;
  typesByExtension: {
    [extension: string]: ContentType;
  };
  version: string;
  versionDirPath: string;
}

declare type ContentType = 'css' | 'html' | 'js';

declare interface Entry {
  directories: Array<string>;
  isApp: boolean;
  isElectron: boolean;
  isSecure: boolean;
  isStatic: boolean;
  main: string | undefined;
}

type Http2ServerRequest = import('http2').Http2ServerRequest;
type Http2ServerResponse = import('http2').Http2ServerResponse;
type IncomingMessage = import('http').IncomingMessage;
type ServerResponse = import('http').ServerResponse;
type HttpServer = import('http').Server;
type HttpServerOptions = import('http').ServerOptions;
type Http2SecureServer = import('http2').Http2SecureServer;
type Http2SecureServerOptions = import('http2').SecureServerOptions;
type esbuild = {
  build(
    options: import('esbuild').BuildOptions & { write: false },
  ): Promise<import('esbuild').BuildResult>;
  transform(
    input: string,
    options?: import('esbuild').TransformOptions,
  ): Promise<import('esbuild').TransformResult>;
};

type Req = (IncomingMessage | Http2ServerRequest) & {
  filePath: string;
  type?: ContentType;
  url: string;
  params?: { [key: string]: string } | {};
};
type Res = (ServerResponse | Http2ServerResponse) & {
  bundled: boolean;
  encoding: string;
  metrics: Metrics;
  mocked: boolean;
  rerouted: boolean;
  transformed: boolean;
  unhandled: boolean;
  url: string;
  error?: Error;
};
type RequestHandler = (req: Req, res: Res) => void;
interface DestroyableHttpServer extends HttpServer {
  destroy(): void;
}
