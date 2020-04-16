'use strict';

const commonjsPlugin = require('@rollup/plugin-commonjs');
const jsonPlugin = require('@rollup/plugin-json');
const replacePlugin = require('@rollup/plugin-replace');
const resolvePlugin = require('@rollup/plugin-node-resolve');

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
    },
    sourceMap: false,
  }),
];

// Prevent mutation by creating a new object for every require('default-rollup-config.js')
Object.defineProperty(module, 'exports', {
  /** @returns { import("rollup").RollupOptions } */
  get() {
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
  },
});
