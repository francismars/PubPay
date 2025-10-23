const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: 'development',
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, '../../../dist/homepage'),
    filename: 'main.[contenthash].js',
    clean: true,
    publicPath: '/',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@pubpay/shared-services': path.resolve(__dirname, '../../packages/shared-services/src'),
      '@pubpay/shared-ui': path.resolve(__dirname, '../../packages/shared-ui/src'),
      '@pubpay/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@pubpay/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src'),
      '@homepage': path.resolve(__dirname, '../../apps/homepage/src'),
    },
    fallback: {
      "buffer": require.resolve("buffer"),
      "stream": require.resolve("stream-browserify"),
      "process": require.resolve("process/browser"),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        //type: 'asset/resource',
        generator: {
          filename: 'styles/[name][ext]',
          publicPath: '/',
        },
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|webp)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name][ext]',
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
    }),
    new webpack.DefinePlugin({
      'process.env': JSON.stringify({}),
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],
  devServer: {
    static: [
      {
        directory: path.join(__dirname, '../../../dist/homepage'),
        publicPath: '/',
        serveIndex: false,
      },
      // CSS dev
      {
        directory: path.join(__dirname, '../../apps/homepage/src/styles'),
        publicPath: '/styles',
        serveIndex: false,
      },
      {
        directory: path.join(__dirname, '../../../public'),
        publicPath: '/',
        serveIndex: false,
      },
      // CSS dev end
    ],
    compress: true,
    port: 3000,
    hot: true,
    historyApiFallback: {
      index: '/index.html',
    },
    devMiddleware: {
      publicPath: '/',
    },
  },
};
