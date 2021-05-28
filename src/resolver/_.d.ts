declare interface Package {
  aliases: { [key: string]: string };
  exports?: string | { [key: string]: string | { [key: string]: string } };
  isProjectPackage: boolean;
  manifestPath: string;
  main?: string;
  name: string;
  path: string;
  paths: Array<string>;
  version: string;
}
