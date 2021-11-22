import path from 'path';

export default {
  onSend(filePath, code) {
    return `this is sent content for: ${path.basename(filePath)}`;
  },
};
