/** connect-src value for HtmlWebpackPlugin templates. Localhost only in non-prod. */
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  cspConnectSrc: isProduction
    ? "'self' https: wss:"
    : "'self' https: wss: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
};
