import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

export { bundleDts };

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Run tsc's JS entry via `node` (cross-platform; the `.bin/tsc` shim is
// `tsc.CMD` on Windows and not directly spawnable).
const TSC = path.join(
  path.dirname(require.resolve('typescript/package.json')),
  'bin',
  'tsc',
);
const TYPES_DIR = path.join(ROOT, '.types');

const ENTRIES = ['dvlp', 'dvlp-test', 'dvlp-test-browser'];

const BLOCK_RE =
  /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|enum|namespace|module|global)\b/;
const DECL_RE =
  /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|enum|namespace|type|function|const|let|var)\s+([A-Za-z0-9_$]+)/;

/**
 * Regenerate `.types/`, bundle each entry's declaration surface into a
 * self-contained `.d.ts` at the repo root, then clean up `.types/`.
 */
function bundleDts() {
  execFileSync(process.execPath, [TSC, '-p', 'tsconfig.build.json'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const files = new Map();

  for (const key of listDeclFiles(TYPES_DIR)) {
    files.set(
      key,
      parseFile(key, fs.readFileSync(path.join(TYPES_DIR, key), 'utf8')),
    );
  }

  for (const entry of ENTRIES) {
    const output = bundleEntry(entry, files);
    fs.writeFileSync(path.join(ROOT, `${entry}.d.ts`), output, 'utf8');
  }

  fs.rmSync(TYPES_DIR, { recursive: true, force: true });
}

// 7. Helper functions

function listDeclFiles(dir, base = dir) {
  const out = [];

  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);

    if (dirent.isDirectory()) {
      out.push(...listDeclFiles(full, base));
    } else if (dirent.name.endsWith('.d.ts')) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }

  return out.sort();
}

/**
 * Split a `.d.ts` source into top-level statements, keeping leading
 * comments (JSDoc) glued to the declaration that follows them.
 */
function splitStatements(text) {
  const out = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    while (i < n && /\s/.test(text[i])) {
      i++;
    }
    if (i >= n) {
      break;
    }

    const start = i;
    let codeStart = i;

    while (codeStart < n) {
      if (/\s/.test(text[codeStart])) {
        codeStart++;
      } else if (text[codeStart] === '/' && text[codeStart + 1] === '/') {
        codeStart += 2;
        while (codeStart < n && text[codeStart] !== '\n') {
          codeStart++;
        }
      } else if (text[codeStart] === '/' && text[codeStart + 1] === '*') {
        codeStart += 2;
        while (
          codeStart < n &&
          !(text[codeStart] === '*' && text[codeStart + 1] === '/')
        ) {
          codeStart++;
        }
        codeStart += 2;
      } else {
        break;
      }
    }

    const head = text.slice(codeStart, codeStart + 160);
    const isBlock = BLOCK_RE.test(head);

    let j = codeStart;
    let curly = 0;
    let paren = 0;
    let bracket = 0;
    let sawOpen = false;
    let end = -1;

    while (j < n) {
      const c = text[j];

      if (c === '/' && text[j + 1] === '/') {
        j += 2;
        while (j < n && text[j] !== '\n') {
          j++;
        }
        continue;
      }
      if (c === '/' && text[j + 1] === '*') {
        j += 2;
        while (j < n && !(text[j] === '*' && text[j + 1] === '/')) {
          j++;
        }
        j += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        j++;
        while (j < n) {
          if (text[j] === '\\') {
            j += 2;
            continue;
          }
          if (text[j] === c) {
            j++;
            break;
          }
          j++;
        }
        continue;
      }

      if (c === '{') {
        curly++;
        sawOpen = true;
      } else if (c === '}') {
        curly--;
        if (isBlock && sawOpen && curly === 0 && paren === 0 && bracket === 0) {
          j++;
          let k = j;
          while (k < n && (text[k] === ' ' || text[k] === '\t')) {
            k++;
          }
          if (text[k] === ';') {
            j = k + 1;
          }
          end = j;
          break;
        }
      } else if (c === '(') {
        paren++;
      } else if (c === ')') {
        paren--;
      } else if (c === '[') {
        bracket++;
      } else if (c === ']') {
        bracket--;
      } else if (
        c === ';' &&
        !isBlock &&
        curly === 0 &&
        paren === 0 &&
        bracket === 0
      ) {
        j++;
        end = j;
        break;
      }

      j++;
    }

    if (end === -1) {
      end = n;
    }
    out.push(text.slice(start, end));
    i = end;
  }

  return out;
}

/**
 * Index the code position of a statement (skipping leading comments).
 */
function codeStartIndex(text) {
  let i = 0;
  const n = text.length;

  while (i < n) {
    if (/\s/.test(text[i])) {
      i++;
    } else if (text[i] === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < n && text[i] !== '\n') {
        i++;
      }
    } else if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        i++;
      }
      i += 2;
    } else {
      break;
    }
  }

  return i;
}

/**
 * Extract referenced identifiers from a declaration, ignoring comments and
 * string literals.
 */
function scanIdentifiers(text) {
  const ids = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const c = text[i];

    if (c === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < n && text[i] !== '\n') {
        i++;
      }
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < n) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === c) {
          i++;
          break;
        }
        i++;
      }
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(text[j])) {
        j++;
      }
      ids.push(text.slice(i, j));
      i = j;
    } else {
      i++;
    }
  }

  return ids;
}

/**
 * Resolve a relative import specifier to a `.types/` file key.
 */
function resolveRel(spec, fromKey) {
  const dir = path.posix.dirname(fromKey);
  const joined = path.posix.normalize(path.posix.join(dir, spec));
  return joined.replace(/\.[cm]?tsx?$/, '.d.ts').replace(/\.[cm]?js$/, '.d.ts');
}

/**
 * Parse the members of a `{ a, b as c }` import/export clause.
 */
function parseNamedBindings(inner) {
  return inner
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      if (m) {
        return { orig: m[1], local: m[2], clause: part };
      }
      return { orig: part, local: part, clause: part };
    });
}

function parseFile(key, text) {
  const info = {
    key,
    localDecls: new Map(),
    relImports: new Map(),
    extImports: new Map(),
    exportFrom: [],
    plainReExports: [],
    exportedLocalNames: new Set(),
    globalBlocks: [],
  };
  let order = 0;

  for (const stmt of splitStatements(text)) {
    const code = stmt.slice(codeStartIndex(stmt));

    // import ... from '...'
    const imp = code.match(
      /^import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/,
    );
    if (/^import\b/.test(code)) {
      if (imp) {
        registerImport(info, key, imp[2], imp[3]);
      }
      continue;
    }

    // declare global { ... } / global { ... }
    if (/^(?:declare\s+)?global\b/.test(code)) {
      info.globalBlocks.push(code);
      continue;
    }

    // export { ... } from '...' / export type { ... } from '...'
    const efrom = code.match(
      /^export\s+(type\s+)?\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"]/,
    );
    if (efrom) {
      info.exportFrom.push({
        names: parseNamedBindings(efrom[2]),
        file: resolveRel(efrom[3], key),
      });
      continue;
    }

    // export * from '...'
    if (/^export\s+\*\s+from/.test(code)) {
      continue;
    }

    // export { ... } (re-export of imported bindings)
    const eplain = code.match(/^export\s+(type\s+)?\{([\s\S]*?)\}\s*;?\s*$/);
    if (eplain && !/\bfrom\b/.test(code)) {
      info.plainReExports.push(
        ...parseNamedBindings(eplain[2]).map((b) => b.orig),
      );
      continue;
    }

    // export default X
    if (/^export\s+default\b/.test(code)) {
      continue;
    }

    // declaration
    const decl = code.match(DECL_RE);
    if (decl) {
      const name = decl[1];
      info.localDecls.set(name, {
        name,
        text: stmt,
        file: key,
        index: order++,
      });
      if (/^export\b/.test(code)) {
        info.exportedLocalNames.add(name);
      }
    }
  }

  return info;
}

function registerImport(info, key, clause, module) {
  const isRelative = module.startsWith('.');
  const braces = clause.match(/\{([\s\S]*?)\}/);

  if (braces) {
    for (const b of parseNamedBindings(braces[1])) {
      if (isRelative) {
        info.relImports.set(b.local, {
          file: resolveRel(module, key),
          origName: b.orig,
        });
      } else {
        info.extImports.set(b.local, {
          module,
          clause: b.clause,
          kind: 'named',
        });
      }
    }
  }

  const ns = clause.match(/\*\s+as\s+([A-Za-z0-9_$]+)/);
  const def = clause
    .replace(/\{[\s\S]*?\}/, '')
    .replace(/\*\s+as\s+[A-Za-z0-9_$]+/, '')
    .replace(/,/g, '')
    .trim();

  if (!isRelative && ns) {
    info.extImports.set(ns[1], { module, name: ns[1], kind: 'namespace' });
  }
  if (!isRelative && def && /^[A-Za-z0-9_$]+$/.test(def)) {
    info.extImports.set(def, { module, name: def, kind: 'default' });
  }
}

/**
 * Resolve a name reference (from `fromKey`'s perspective) to either a local
 * declaration in some file or an external import.
 */
function resolveName(name, fromKey, files, seen = new Set()) {
  const memo = `${fromKey}::${name}`;
  if (seen.has(memo)) {
    return null;
  }
  seen.add(memo);

  const info = files.get(fromKey);
  if (!info) {
    return null;
  }

  if (info.localDecls.has(name)) {
    return { kind: 'local', decl: info.localDecls.get(name) };
  }
  if (info.relImports.has(name)) {
    const { file, origName } = info.relImports.get(name);
    return resolveName(origName, file, files, seen);
  }
  if (info.extImports.has(name)) {
    return { kind: 'external', ext: info.extImports.get(name) };
  }

  for (const ef of info.exportFrom) {
    for (const b of ef.names) {
      if (b.local === name) {
        return resolveName(b.orig, ef.file, files, seen);
      }
    }
  }

  return null;
}

function bundleEntry(entry, files) {
  const entryKey = `${entry}.d.ts`;
  const entryInfo = files.get(entryKey);

  const included = new Map();
  const externalsByModule = new Map();
  const externalDefaults = new Map();
  const queue = [];

  const include = (name, fromKey) => {
    const resolved = resolveName(name, fromKey, files);
    if (!resolved) {
      return;
    }

    if (resolved.kind === 'external') {
      addExternal(externalsByModule, externalDefaults, resolved.ext);
      return;
    }

    const { decl } = resolved;
    if (included.has(decl.name)) {
      return;
    }

    included.set(decl.name, decl);
    queue.push(decl);
  };

  // Roots: locally-defined exports of the entry.
  for (const name of entryInfo.exportedLocalNames) {
    include(name, entryKey);
  }
  // Roots: `export { ... } from './rel.ts'`.
  for (const ef of entryInfo.exportFrom) {
    for (const b of ef.names) {
      include(b.orig, ef.file);
    }
  }
  // Roots: `export { ... }` of imported bindings.
  for (const name of entryInfo.plainReExports) {
    include(name, entryKey);
  }
  // Roots: names referenced by `declare global` blocks.
  for (const block of entryInfo.globalBlocks) {
    for (const id of scanIdentifiers(block)) {
      include(id, entryKey);
    }
  }

  // Transitive closure.
  while (queue.length > 0) {
    const decl = queue.shift();
    for (const id of scanIdentifiers(decl.text)) {
      include(id, decl.file);
    }
  }

  return emit(
    included,
    externalsByModule,
    externalDefaults,
    entryInfo.globalBlocks,
  );
}

function addExternal(byModule, defaults, ext) {
  if (ext.kind === 'named') {
    if (!byModule.has(ext.module)) {
      byModule.set(ext.module, new Set());
    }
    byModule.get(ext.module).add(ext.clause);
  } else {
    defaults.set(`${ext.module}::${ext.kind}::${ext.name}`, ext);
  }
}

function ensureExported(text) {
  const idx = codeStartIndex(text);
  const before = text.slice(0, idx);
  const code = text.slice(idx);
  return /^export\b/.test(code) ? text : `${before}export ${code}`;
}

function emit(included, externalsByModule, externalDefaults, globalBlocks) {
  const chunks = [];

  const importLines = [];
  for (const module of [...externalsByModule.keys()].sort()) {
    const names = [...externalsByModule.get(module)].sort();
    importLines.push(`import type { ${names.join(', ')} } from '${module}';`);
  }
  for (const ext of externalDefaults.values()) {
    if (ext.kind === 'namespace') {
      importLines.push(`import type * as ${ext.name} from '${ext.module}';`);
    } else {
      importLines.push(`import type ${ext.name} from '${ext.module}';`);
    }
  }
  if (importLines.length > 0) {
    chunks.push(importLines.join('\n'));
  }

  const decls = [...included.values()].sort((a, b) =>
    a.file === b.file ? a.index - b.index : a.file < b.file ? -1 : 1,
  );
  for (const decl of decls) {
    chunks.push(ensureExported(decl.text).trim());
  }

  for (const block of globalBlocks) {
    chunks.push(block.trim());
  }

  return `${chunks.join('\n\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bundleDts();
  console.log('Bundled: dvlp.d.ts, dvlp-test.d.ts, dvlp-test-browser.d.ts');
}
