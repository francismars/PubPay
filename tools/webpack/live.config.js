const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProduction ? 'production' : 'development',
  entry: '../../apps/live/src/index.tsx',
  output: {
    path: path.resolve(__dirname, '../../dist/live'),
    filename: 'main.[contenthash].js',
    publicPath: isProduction ? '/live/' : '/',
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
      '@live': path.resolve(__dirname, '../../apps/live/src')
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
      template: '../../apps/live/src/index.html',
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
    // Copy favicon and icon files to output directory
    // These are referenced in index.html but not imported in code, so we copy them directly
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(
            __dirname,
            '../../apps/live/src/assets/images/icon'
          ),
          to: 'images',
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
        directory: path.resolve(__dirname, '../../dist/live')
      },
      {
        directory: path.resolve(__dirname, '../../apps/live/src'),
        publicPath: '/apps/live/src'
      }
    ],
    allowedHosts: 'all',
    port: 3001,
    hot: true,
    open: true,
    historyApiFallback: true
  },
  ...(isProduction
    ? {
        optimization: {
          minimize: true,
          // Enable tree shaking - mark unused exports for removal
          usedExports: true,
          // Enable side effects flag mode - webpack will check package.json "sideEffects" field
          // CSS files are already marked in package.json, so they'll be preserved
          sideEffects: 'flag',
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
