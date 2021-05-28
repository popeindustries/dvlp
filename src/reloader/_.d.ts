declare interface Reloader {
  destroy: () => Promise<void>;
  reloadEmbed: string;
  reloadPort: number;
  reloadUrl: string;
  send: (filePath: string) => void;
}
