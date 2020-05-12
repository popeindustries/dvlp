'use strict';

const { expect } = require('chai');
const { importModule } = require('../src/utils/module.js');
const path = require('path');

describe('importModule()', () => {
  it('should return an es module', () => {
    const module = importModule(
      path.resolve(__dirname, 'fixtures/config.esm.js'),
    );
    expect(module).to.have.property('dep', 'HI!');
  });
  it('should return a cjs module', () => {
    const module = importModule(path.resolve(__dirname, 'fixtures/config.js'));
    expect(module).to.have.property('dep', 'HI!');
  });
  it('should return a jsx module', () => {
    const module = importModule(
      path.resolve(__dirname, 'fixtures/component.jsx'),
      require('./fixtures/transpilerServer.js'),
    );
    expect(module).to.have.property('type', 'div');
  });
});
