const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProduction ? 'production' : 'development',
  entry: '../../apps/jukebox/src/index.tsx',
  output: {
    path: path.resolve(__dirname, '../../dist/jukebox'),
    filename: 'main.[contenthash].js',
    publicPath: '/',
    clean: true
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@pubpay/shared-services': path.resolve(
        __dirname,
        '../../packages/shared-services/src'
      ),
      '@pubpay/shared-ui': path.resolve(
        __dirname,
        '../../packages/shared-ui/src'
      ),
      '@pubpay/shared-types': path.resolve(
        __dirname,
        '../../packages/shared-types/src'
      ),
      '@pubpay/shared-utils': path.resolve(
        __dirname,
        '../../packages/shared-utils/src'
      ),
      '@': path.resolve(__dirname, '../../apps/jukebox/src')
    },
    fallback: {
      buffer: require.resolve('buffer'),
      stream: require.resolve('stream-browserify'),
      process: require.resolve('process/browser')
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/i,
        use: isProduction
          ? [
              require.resolve('mini-css-extract-plugin/dist/loader'),
              'css-loader'
            ]
          : ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpe?g|gif|svg|webp|ico)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name][ext]'
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: '../../apps/jukebox/src/index.html',
      filename: 'index.html',
      minify: isProduction
        ? {
            removeComments: true,
            collapseWhitespace: true,
            removeRedundantAttributes: true,
            useShortDoctype: true,
            removeEmptyAttributes: true,
            removeStyleLinkTypeAttributes: true,
            keepClosingSlash: true,
            minifyJS: true,
            minifyCSS: true,
            minifyURLs: true
          }
        : false
    }),
    new (require('webpack').DefinePlugin)({
      'process.env': JSON.stringify(process.env)
    }),
    new (require('webpack').ProvidePlugin)({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    ...(isProduction
      ? [
          new (require('mini-css-extract-plugin'))({
            filename: 'css/[name].[contenthash].css'
          })
        ]
      : [])
  ],
  devServer: {
    static: {
      directory: path.resolve(__dirname, '../../dist/jukebox')
    },
    port: 3003,
    hot: true,
    open: true,
    historyApiFallback: true
  },
  ...(isProduction
    ? {
        optimization: {
          minimize: true,
          splitChunks: {
            chunks: 'all',
            cacheGroups: {
              vendor: {
                test: /[\\/]node_modules[\\/]/,
                name: 'vendors',
                chunks: 'all'
              }
            }
          }
        }
      }
    : {})
};
