const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: 'development',
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
        use: ['style-loader', 'css-loader']
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
      filename: 'index.html'
    }),
    new webpack.DefinePlugin({
      'process.env': JSON.stringify({})
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    })
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
    hot: true,
    historyApiFallback: {
      index: '/index.html'
    },
    devMiddleware: {
      publicPath: '/'
    }
  }
};
