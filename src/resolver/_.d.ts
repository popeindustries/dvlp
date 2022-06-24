declare interface Package {
  browser?: Record<string, string>;
  env: 'browser' | 'node';
  exports?: string | Record<string, string | Record<string, string>>;
  exportsConditions: Array<string>;
  imports?: string | Record<string, string | Record<string, string>>;
  isProjectPackage: boolean;
  manifestPath: string;
  main?: string;
  name: string;
  path: string;
  paths: Array<string>;
  version: string;
}
