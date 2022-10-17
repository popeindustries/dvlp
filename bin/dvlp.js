#!/usr/bin/env node

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import { readFileSync } from 'fs';

const pkg = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8');

program
  .usage('[options] [path...]')
  .description(
    `Start a development server, restarting and reloading connected browsers on file changes.
    Serves static files from one or more "path" directories, or a custom application
    server if "path" is a single application server file.`,
  )
  .option('-p, --port <port>', 'port number', parseInt)
  .option('-m, --mock <path>', 'path to mock files (directory, file, glob pattern)')
  .option('-k, --hooks <path>', 'path to optional hooks registration file')
  .option(
    '--ssl <path>',
    `enable https mode by specifying path to directory containing ".crt" and ".key" files (directory, glob pattern)`,
  )
  .option('-s, --silent', 'suppress default logging')
  .option('--no-reload', 'disable reloading connected browsers on file change')
  .option('--electron', 'run file as electron.js entry file')
  .arguments('[path...]')
  .action(boot)
  .version(pkg.version, '-v, --version');

program.parse(process.argv);

async function boot(path = [process.cwd()]) {
  try {
    const { server } = await import('../dvlp.js');
    const options = program.opts();

    await server(path, {
      certsPath: options.ssl,
      electron: options.electron,
      hooksPath: options.hooks,
      mockPath: options.mock,
      port: options.port,
      reload: options.reload,
      silent: options.silent,
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
