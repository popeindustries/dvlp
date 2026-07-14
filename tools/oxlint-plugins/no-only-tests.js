// oxlint custom rule (ESLint-compatible API, loaded via `jsPlugins`).
// Replaces eslint-plugin-no-only-tests: oxlint's built-in jest/vitest
// `no-focused-tests` only fire on `*.test.*` / `__tests__/` naming, but this
// repo names tests `*-test.{js,ts}`, so the built-ins never match. This rule
// has no filename gating and runs on every linted file.

const TEST_FNS = new Set([
  'describe',
  'it',
  'test',
  'context',
  'suite',
  'tape',
  'serial',
  'fixture',
]);

export default {
  meta: { name: 'dvlp' },
  rules: {
    'no-only-tests': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow focused tests (`.only`)' },
      },
      create(context) {
        return {
          MemberExpression(node) {
            if (
              node.property?.name === 'only' &&
              TEST_FNS.has(node.object?.name)
            ) {
              context.report({
                node: node.property,
                message: `${node.object.name}.only is a focused test — remove \`.only\` before committing`,
              });
            }
          },
        };
      },
    },
  },
};
