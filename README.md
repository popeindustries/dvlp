[![NPM Version](https://img.shields.io/npm/v/dvlp.svg?style=flat)](https://npmjs.org/package/dvlp)
[![Build Status](https://img.shields.io/travis/popeindustries/dvlp.svg?style=flat)](https://travis-ci.org/popeindustries/dvlp)

# dvlp

**dvlp** is a no-configuration, no-conditionals, no-middleware, no-nonsense tool to help you move quickly while developing for the web! You shouldn't have to jump through hoops to get a development web server up and running, and you definitely shouldn't have to include development-only functionality in your bullet-proof production code! Serve up one or more static file directories, or launch your custom application server, restarting and reloading connected browsers automatically as you work.

## Install

Install globally or locally in your project with npm/yarn:

```bash
$ npm install dvlp
```

## Usage

```text
$ dvlp -h

  Usage: dvlp [options] <path...>

  Start a development server, restarting and reloading connected browsers on file changes.
  Serves static files from one or more <path> directories, or a custom application
  server if <path> is a single file

  Options:

    -p, --port <port>  port number
    -r, --reload       reload connected browsers on file change
    -v, --version      output the version number
    -h, --help         output usage information
```

## API
