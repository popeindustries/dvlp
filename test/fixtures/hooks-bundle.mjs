import path from 'path';

export default {
  onDependencyBundle(id, filePath) {
    return `this is bundled content for: ${path.basename(filePath)}`;
  },
};
