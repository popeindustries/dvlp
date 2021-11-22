declare namespace NodeJS {
  interface Global {
    $MOCK_CLIENT?: string;
    $RELOAD_CLIENT?: string;
    $VERSION: string;
    sourceFiles: Set<string>;
  }
}
