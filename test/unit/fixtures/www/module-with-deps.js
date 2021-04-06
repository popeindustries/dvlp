import hi from './dep-esm.js';
import Debug from 'debug';

const debug = new Debug('test');

debug(hi);

export { hi as default };
