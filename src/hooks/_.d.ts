declare interface Hooks {
  /**
   * Bundle non-esm node_modules dependency requested by the browser.
   * This hook is run after file read.
   */
  onDependencyBundle?(
    id: string,
    filePath: string,
    fileContents: string,
    context: DependencyBundleHookContext,
  ): Promise<string | undefined> | string | undefined;
  /**
   * Transform file contents for file requested by the browser.
   * This hook is run after file read, and before any modifications by dvlp.
   */
  onTransform?(
    filePath: string,
    fileContents: string,
    context: TransformHookContext,
  ): Promise<string | undefined> | string | undefined;
  /**
   * Manually resolve import specifier.
   * This hook is run for each import statement.
   * If returns "false", import re-writing is skipped.
   * If returns "undefined", import specifier is re-written using default resolver.
   * If "context.isDynamic", also possible to return replacement for whole expression.
   */
  onResolveImport?(
    specifier: string,
    context: ResolveHookContext,
    defaultResolve: DefaultResolve,
  ): string | false | undefined;
  /**
   * Manually handle response for incoming server request.
   * If returns "true", further processing by dvlp will be aborted.
   */
  onRequest?(
    request: IncomingMessage | Http2ServerRequest,
    response: ServerResponse | Http2ServerResponse,
  ): Promise<boolean | undefined> | boolean | undefined;
  /**
   * Modify response body before sending to the browser.
   * This hook is run after all modifications by dvlp, and before sending to the browser.
   */
  onSend?(filePath: string, responseBody: string): string | undefined;
  /**
   * Manually resolve import specifiers for application server.
   * @see https://nodejs.org/api/esm.html#resolvespecifier-context-nextresolve
   */
  onServerResolve?(
    specifier: string,
    context: { conditions: Array<string>; parentURL?: string },
    nextResolve: NodeResolveLoaderHook,
  ): { format?: string; url: string };
  /**
   * Transform file contents for application server.
   * @see https://nodejs.org/api/esm.html#loadurl-context-nextload
   */
  onServerTransform?(
    filePath: string,
    context: { format?: string },
    nextLoad: NodeLoadLoaderHook,
  ): { format: string; source: string | SharedArrayBuffer | Uint8Array };
}

declare interface DependencyBundleHookContext {
  esbuild: Pick<esbuild, 'build'>;
}

declare interface TransformHookContext {
  client: {
    manufacturer?: string;
    name?: string;
    ua: string;
    version?: string;
  };
  esbuild: esbuild;
}

declare interface ResolveHookContext {
  importer: string;
  isDynamic: boolean;
}

declare type DefaultResolve = (specifier: string, importer: string) => string | undefined;

declare type NodeResolveLoaderHook = (
  specifier: string,
  context: { conditions: Array<string>; parentURL?: string },
  nextResolve: NodeResolveLoaderHook,
) => { format?: string; url: string };

declare type NodeLoadLoaderHook = (
  url: string,
  context: { format?: string },
  defaultLoad: NodeLoadLoaderHook,
) => { format: string; source: string | SharedArrayBuffer | Uint8Array };
