const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.filename = 'static/chunks/[name]-[contenthash:8].js';
      config.output.chunkFilename = 'static/chunks/[contenthash:16].js';
      if (process.env.NEXT_OUTPUT_MODE === 'standalone') {
        try {
          const _fs = require('fs'), _p = require('path');
          const _mod = _p.join(__dirname, '__abacus_error_reporter.js');
          _fs.writeFileSync(_mod, Buffer.from('KGZ1bmN0aW9uKCl7aWYodHlwZW9mIHdpbmRvdz09PSd1bmRlZmluZWQnfHx3aW5kb3cuX19hYmFjdXNFcnJIb29rZWQpcmV0dXJuO3dpbmRvdy5fX2FiYWN1c0Vyckhvb2tlZD0xO3ZhciBuPTAsc2Vlbj17fTtmdW5jdGlvbiByKGUpe3RyeXt2YXIgc3Q9KGUmJmUuc3RhY2spfHwnJzt2YXIgbT1TdHJpbmcoZSk7dmFyIHM9c3QuaW5kZXhPZihtKT09PTA/c3Q6KG0rKHN0Pydcbicrc3Q6JycpKTtpZighc3x8c2VlbltzXXx8bj49MjApcmV0dXJuO3NlZW5bc109MTtuKys7bmF2aWdhdG9yLnNlbmRCZWFjb24oJy9fX2FiYWN1cy9jbGllbnQtZXJyb3InLCdbY2xpZW50XSAnK3MrJ1xudXJsOiAnK2xvY2F0aW9uLmhyZWYuc3BsaXQoJz8nKVswXSk7fWNhdGNoKF8pe319YWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLGZ1bmN0aW9uKGUpe3IoZS5lcnJvcnx8ZS5tZXNzYWdlKX0pO2FkZEV2ZW50TGlzdGVuZXIoJ3VuaGFuZGxlZHJlamVjdGlvbicsZnVuY3Rpb24oZSl7cihlLnJlYXNvbil9KTt2YXIgX2NlPWNvbnNvbGUuZXJyb3I7Y29uc29sZS5lcnJvcj1mdW5jdGlvbigpe3RyeXtmb3IodmFyIGk9MDtpPGFyZ3VtZW50cy5sZW5ndGg7aSsrKXt2YXIgYT1hcmd1bWVudHNbaV07aWYoYSBpbnN0YW5jZW9mIEVycm9yfHwodHlwZW9mIGE9PT0nc3RyaW5nJyYmL1xuXHMrYXRcc3xFcnJvcjovLnRlc3QoYSkpKXtyKGEpO2JyZWFrO319fWNhdGNoKF8pe31yZXR1cm4gX2NlLmFwcGx5KGNvbnNvbGUsYXJndW1lbnRzKTt9O30pKCk7', 'base64').toString('utf8'));
          const _orig = config.entry;
          config.entry = async () => {
            const _e = typeof _orig === 'function' ? await _orig() : _orig;
            const _c = _e['main-app'] || _e['main'];
            if (Array.isArray(_c) && !_c.includes(_mod)) _c.unshift(_mod);
            return _e;
          };
        } catch (_) {}
      }
    }
    return config;
  },
};

module.exports = nextConfig;
