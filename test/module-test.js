'use strict';

const { expect } = require('chai');
const Hooks = require('../src/hooks/index.js');
const { importModule } = require('../src/utils/module.js');
const path = require('path');

const hooks = new Hooks();

describe('importModule()', () => {
  it('should return an es module', () => {
    const module = importModule(path.resolve(__dirname, 'fixtures/config.esm.js'), hooks.serverTransform);
    expect(module).to.have.property('dep', 'HI!');
  });
  it('should return a cjs module', () => {
    const module = importModule(path.resolve(__dirname, 'fixtures/config.js'));
    expect(module).to.have.property('dep', 'HI!');
  });
  it('should return a jsx module', () => {
    const module = importModule(path.resolve(__dirname, 'fixtures/component.jsx'), hooks.serverTransform);
    expect(module).to.have.property('type', 'div');
  });
});
