// Which build of the game this is (docs/architecture.md, "Builds"):
//   'dev'   a checkout served as it is (npm run serve): dev mode available;
//   'live'  the published site: no dev mode;
//   'beta'  the beta, published at /beta/: its own saves, no online
//           features, the reference solutions alongside, dev mode available.
// tools/build-site.js rewrites this file in the build it makes.
export const CHANNEL = 'dev';
