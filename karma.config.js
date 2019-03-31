module.exports = function(config) {
  config.set({
    autoWatch: false,
    browsers: ['ChromeHeadless'],
    colors: true,
    concurrency: Infinity,
    files: ['test-browser/**/*.js'],
    frameworks: ['mocha', 'chai'],
    logLevel: config.LOG_INFO,
    port: 9876,
    reporters: ['spec']
  });
};
