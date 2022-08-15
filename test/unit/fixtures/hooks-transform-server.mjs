export default {
  onServerTransform(url, context, defaultLoad) {
    if (url.endsWith('body.ts')) {
      return { format: 'module', source: 'export default "hi from body hook";' };
    }
    return defaultLoad(url, context);
  },
};
