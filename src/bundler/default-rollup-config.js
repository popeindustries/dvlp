'use strict';

const commonjsPlugin = require('@rollup/plugin-commonjs');
const jsonPlugin = require('@rollup/plugin-json');
const replacePlugin = require('@rollup/plugin-replace');
let resolvePlugin = require('@rollup/plugin-node-resolve');

if ('default' in resolvePlugin) {
  // @ts-ignore
  resolvePlugin = resolvePlugin.default;
}

const plugins = [
  // @ts-ignore
  replacePlugin({
    'process.env.NODE_ENV': `"${process.env.NODE_ENV}"` || '"development"',
  }),
  // @ts-ignore
  resolvePlugin({
    mainFields: ['browser', 'module', 'main'],
  }),
  // @ts-ignore
  jsonPlugin(),
  // @ts-ignore
  commonjsPlugin({
    namedExports: {
      react: [
        'Children',
        'Component',
        'Fragment',
        'Profiler',
        'PureComponent',
        'StrictMode',
        'Suspense',
        '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
        'cloneElement',
        'createContext',
        'createElement',
        'createFactory',
        'createRef',
        'forwardRef',
        'isValidElement',
        'lazy',
        'memo',
        'useCallback',
        'useContext',
        'useDebugValue',
        'useEffect',
        'useImperativeHandle',
        'useLayoutEffect',
        'useMemo',
        'useReducer',
        'useRef',
        'useState',
        'version',
      ],
      'react-dom': [
        '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
        'createPortal',
        'findDOMNode',
        'flushSync',
        'hydrate',
        'render',
        'unmountComponentAtNode',
        'unstable_batchedUpdates',
        'unstable_createPortal',
        'unstable_renderSubtreeIntoContainer',
        'version',
      ],
      'react-is': ['isContextConsumer', 'isValidElementType'],
    },
    sourceMap: false,
  }),
];

/**
 * Retrieve the default Rollup-config
 * @returns { import("rollup").RollupOptions }
 */
exports.getDefaultRollupConfig = function getDefaultRollupConfig() {
  return {
    // Only bundle local package files
    external: (id, parent, isResolved) => {
      // Skip if already handled by plugin
      if (isResolved || (parent && parent.includes('?commonjs-proxy'))) {
        return false;
      }
      return /^[^./\0]/.test(id);
    },
    plugins: plugins.slice(),
    treeshake: false,
    output: {
      format: 'es',
      sourcemap: false,
    },
  };
};
