import { fatal, noisyWarn } from '../utils/log.ts';
import { Certificate } from '@fidm/x509';
import chalk from 'chalk';
import fs from 'node:fs';
import { getDirectoryContents } from '../utils/file.ts';
import path from 'node:path';

/**
 * Find cert/key
 */
export function resolveCerts(certsPaths: string | Array<string>): {
  cert: Buffer;
  key: Buffer;
} {
  if (!Array.isArray(certsPaths)) {
    certsPaths = [certsPaths];
  }

  let cert: Buffer | undefined;
  let key: Buffer | undefined;

  for (const certsPath of certsPaths) {
    for (const filePath of getDirectoryContents(certsPath)) {
      const extname = path.extname(filePath);

      if (
        !cert &&
        (extname === '.crt' || extname === '.cert') &&
        !filePath.endsWith('.issuer.crt')
      ) {
        cert = fs.readFileSync(filePath);
      } else if (!key && extname === '.key') {
        key = fs.readFileSync(filePath);
      }
    }
  }

  if (!cert || !key) {
    throw Error(
      `unable to find .crt or .key file after searching "${certsPaths.join(
        ', ',
      )}"`,
    );
  }

  return { cert, key };
}

/**
 * Validate cert file data and return CommonName
 */
export function validateCert(certFileData: Buffer): string | undefined {
  try {
    const cert = Certificate.fromPEM(certFileData);
    const {
      subject: { commonName },
      validTo,
    } = cert;
    const now = new Date();
    const expires = new Date(validTo);
    const diff = expires.getTime() - now.getTime();

    if (diff < 10) {
      fatal('ssl certificate has expired!\n');
    } else if (diff / 86400000 < 10) {
      noisyWarn(
        `\n  ${chalk.yellow('⚠️  ssl certificate will expire soon!')}\n`,
      );
    }

    return commonName;
  } catch (err) {
    fatal(err);
  }
}
