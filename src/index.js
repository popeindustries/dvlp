import './config.js';
import sourceMapSupport from 'source-map-support';

sourceMapSupport.install({
  hookRequire: true,
});

export { default as server } from './server/index.js';
export { default as testServer } from './test-server/index.js';
