import {
  parseEsbuildTarget,
  parseUserAgent,
} from '../../src/utils/platform.js';
import { expect } from 'chai';

describe('platform', () => {
  describe('parseEsbuildTarget', () => {
    it('should return default for missing ua', () => {
      expect(parseEsbuildTarget(parseUserAgent())).to.equal('es2020');
    });
    it('should return default for unknown ua', () => {
      expect(parseEsbuildTarget(parseUserAgent('xxxxxxxxx'))).to.equal(
        'es2020',
      );
    });
    it('should correctly parse mobile chrome ua', () => {
      expect(
        parseEsbuildTarget(
          parseUserAgent(
            'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Mobile Safari/537.36',
          ),
        ),
      ).to.equal('chrome87');
    });
    it('should correctly parse ua with missing browser name', () => {
      expect(
        parseEsbuildTarget(
          parseUserAgent(
            'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36',
          ),
        ),
      ).to.equal('chrome69');
    });
    it('should correctly parse ios ua', () => {
      expect(
        parseEsbuildTarget(
          parseUserAgent(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.1 Mobile/15E148 Safari/604.1',
          ),
        ),
      ).to.equal('ios13');
    });
  });
});
