module.exports = {
  async onTransform(filePath, code, context) {
    return (
      await context.esbuildService.build({
        bundle: true,
        format: 'esm',
        entryPoints: [filePath],
        write: false,
      })
    ).outputFiles[0].text;
  },
};
