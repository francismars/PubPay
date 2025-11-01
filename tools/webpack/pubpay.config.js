const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProduction ? 'production' : 'development',
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, '../../../dist/pubpay'),
    filename: 'main.[contenthash].js',
    clean: true,
    publicPath: '/'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
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
      '@pubpay': path.resolve(__dirname, '../../apps/pubpay/src')
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
        test: /\.css$/,
        use: isProduction
          ? [require.resolve('mini-css-extract-plugin/dist/loader'), 'css-loader']
          : ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|webp|ico)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name][ext]'
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
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
    new webpack.DefinePlugin({
      'process.env': JSON.stringify(process.env)
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    ...(isProduction
      ? [new (require('mini-css-extract-plugin'))({ filename: 'css/[name].[contenthash].css' })]
      : [])
  ],
  devServer: {
    static: [
      {
        directory: path.join(__dirname, '../../../dist/pubpay'),
        publicPath: '/',
        serveIndex: false
      }
    ],
    compress: true,
    port: 3000,
    //for ngrok
    allowedHosts: 'all',
    hot: true,
    historyApiFallback: {
      index: '/index.html'
    },
    devMiddleware: {
      publicPath: '/'
    }
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
