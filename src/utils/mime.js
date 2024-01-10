import config from '../config.js';
import { Mime } from 'mime/lite';
import otherTypes from 'mime/types/other.js';
import send from 'send';
import standardTypes from 'mime/types/standard.js';

const mime = new Mime(standardTypes, otherTypes);

mime.define(config.jsMimeTypes, true);
// @ts-ignore
send.mime.define(config.jsMimeTypes, true);

export default mime;
