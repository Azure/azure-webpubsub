import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');

// 1. Build bundle
console.log('📦 Building bundle with esbuild...');
execSync('node scripts/esbuild.config.mjs', { cwd: rootDir, stdio: 'inherit' });

// 2. Generate type declarations
console.log('📝 Generating type declarations...');
execSync('yarn tsc -p tsconfig.json --emitDeclarationOnly', { cwd: rootDir, stdio: 'inherit' });

// 3. Backup and modify package.json
console.log('🔧 Preparing package.json for publish...');
const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(originalPackageJson);

// Remove local file dependencies and dev-only dependencies
delete pkg.dependencies['@azure/web-pubsub-client'];
delete pkg.dependencies['@azure/logger'];
delete pkg.dependencies['events'];

// Keep ws as it's external in esbuild config
// pkg.dependencies should now only have: { "ws": "^8.0.0" }

fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');

try {
  // 4. Pack
  console.log('📦 Creating package tarball...');
  execSync('yarn pack -o azure-web-pubsub-chat-client-%v.tgz', { cwd: rootDir, stdio: 'inherit' });
  
  console.log('✅ Done! Package ready for upload to MyGet.');
} finally {
  // 5. Restore original package.json
  console.log('🔄 Restoring package.json...');
  fs.writeFileSync(packageJsonPath, originalPackageJson);
}
