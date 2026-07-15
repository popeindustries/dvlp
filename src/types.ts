import type {
  BuildOptions,
  BuildResult,
  TransformOptions,
  TransformResult,
} from 'esbuild';
import type {
  Http2SecureServer,
  SecureServerOptions as Http2SecureServerOptions,
  Http2ServerRequest,
  Http2ServerResponse,
} from 'node:http2';
import type {
  Server as HttpServer,
  ServerOptions as HttpServerOptions,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import type { Metrics } from './utils/metrics.ts';

export type {
  HttpServer,
  HttpServerOptions,
  Http2SecureServer,
  Http2SecureServerOptions,
  Http2ServerRequest,
  Http2ServerResponse,
  IncomingMessage,
  ServerResponse,
};

export interface Config {
  activePort: number;
  applicationLoaderURL: URL;
  brokenNamedExportsPackages: Record<string, Array<string>>;
  bundleDirMetaPath: string;
  bundleDirName: string;
  bundleDirPath: string;
  cacheDirPath: string;
  defaultPort: number;
  directories: Array<string>;
  dirPath: string;
  dvlpDirPath: string;
  electronEntryURL: URL;
  esbuildTargetByExtension: {
    [extension: string]: string;
  };
  extensionsByType: {
    [type: string]: Array<string>;
  };
  latency: number;
  maxAge: string;
  maxAgeLong: string;
  serverStartTimeout: number;
  testing: boolean;
  typesByExtension: {
    [extension: string]: ContentType;
  };
  version: string;
  versionDirPath: string;
}

export type ContentType = 'css' | 'html' | 'js';

export interface Entry {
  directories: Array<string>;
  isApp: boolean;
  isElectron: boolean;
  isSecure: boolean;
  isStatic: boolean;
  main: string | undefined;
}

export type esbuild = {
  build(options: BuildOptions & { write: false }): Promise<BuildResult>;
  transform(
    input: string,
    options?: TransformOptions,
  ): Promise<TransformResult>;
};

export type Req = (IncomingMessage | Http2ServerRequest) & {
  filePath: string;
  type?: ContentType;
  url: string;
  params?: Record<string, string>;
};

export type Res = (ServerResponse & Http2ServerResponse) & {
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

export type RequestHandler = (req: Req, res: Res) => void;

export interface DestroyableHttpServer extends HttpServer {
  destroy(): void;
}
