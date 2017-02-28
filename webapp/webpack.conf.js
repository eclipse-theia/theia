var path = require('path');

module.exports = {
  entry: './build/index.js',
  output: {
    filename: './build/bundle.js'
  },
  resolve: {
    modules: [path.resolve('..'), 'node_modules']
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
};
