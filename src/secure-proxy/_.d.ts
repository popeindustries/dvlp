declare interface SecureProxy extends Reloader {
  commonName?: string;
  setApplicationPort(port: number): void;
}
