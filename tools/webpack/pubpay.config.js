const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProduction ? 'production' : 'development',
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, '../../dist/pubpay'),
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
          ? [
              require.resolve('mini-css-extract-plugin/dist/loader'),
              'css-loader'
            ]
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
    // Copy favicon and icon files to output directory
    // These are referenced in index.html but not imported in code, so we copy them directly
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(
            __dirname,
            '../../apps/pubpay/src/assets/images/icon'
          ),
          to: 'images',
          noErrorOnMissing: true
        },
        // Copy PWA manifest and service worker
        {
          from: path.resolve(__dirname, '../../apps/pubpay/src/manifest.json'),
          to: 'manifest.json',
          noErrorOnMissing: true
        },
        {
          from: path.resolve(__dirname, '../../apps/pubpay/src/service-worker.js'),
          to: 'service-worker.js',
          noErrorOnMissing: true
        }
      ]
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
    static: [
      {
        directory: path.join(__dirname, '../../dist/pubpay'),
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
          // Enable tree shaking - mark unused exports for removal
          usedExports: true,
          // Allow aggressive tree shaking for JS, but preserve CSS imports (which have side effects)
          sideEffects: [/\.css$/],
          splitChunks: {
            chunks: 'all',
            minSize: 20000,
            maxSize: 244000, // ~244KB per chunk
            cacheGroups: {
              // React and React DOM together
              react: {
                test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
                name: 'react-vendor',
                priority: 30,
                chunks: 'all'
              },
              // Router
              router: {
                test: /[\\/]node_modules[\\/](react-router|react-router-dom)[\\/]/,
                name: 'router-vendor',
                priority: 25,
                chunks: 'all'
              },
              // Nostr tools (can be large)
              nostr: {
                test: /[\\/]node_modules[\\/](nostr-tools)[\\/]/,
                name: 'nostr-vendor',
                priority: 20,
                chunks: 'all'
              },
              // React Query
              reactQuery: {
                test: /[\\/]node_modules[\\/](@tanstack\/react-query)[\\/]/,
                name: 'react-query-vendor',
                priority: 22,
                chunks: 'all'
              },
              // Other node_modules
              vendor: {
                test: /[\\/]node_modules[\\/]/,
                name: 'vendors',
                priority: 10,
                chunks: 'all',
                minChunks: 2
              },
              // Shared code from packages
              shared: {
                test: /[\\/]packages[\\/]/,
                name: 'shared',
                priority: 15,
                chunks: 'all',
                minChunks: 2
              }
            }
          },
          // Separate runtime chunk
          runtimeChunk: {
            name: 'runtime'
          }
        }
      }
    : {})
};
