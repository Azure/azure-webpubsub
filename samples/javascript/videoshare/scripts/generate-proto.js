const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const sample = path.resolve(__dirname, '..');
const output = path.join(sample, 'src/generated');
const canonical = path.resolve(sample, '../../../protocols/protobuf.webpubsub.azure.v1/webpubsub.v1.proto');
const compiler = require.resolve('protobufjs-cli/bin/pbjs');

mkdirSync(output, { recursive: true });
for (const [root, source] of [
  ['webpubsub', canonical],
  ['video', path.join(sample, 'proto/pubsub.proto')]
]) {
  execFileSync(process.execPath, [
    compiler, '--target', 'static-module', '--wrap', 'commonjs',
    '--force-long', '--root', root,
    '--out', path.join(output, `${root}.js`), source
  ], { stdio: 'inherit' });
}