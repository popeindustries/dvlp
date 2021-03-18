module.exports = {
  async onTransform(filePath, code, context) {
    return (
      await context.esbuild.build({
        bundle: true,
        format: 'esm',
        entryPoints: [filePath],
        write: false,
      })
    ).outputFiles[0].text;
  },
};
