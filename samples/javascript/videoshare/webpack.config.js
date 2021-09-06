const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'video.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'video',
      type: 'umd'
    }
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public' }
      ]
    })
  ]
};