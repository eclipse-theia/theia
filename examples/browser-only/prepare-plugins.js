const { promisify } = require('util');
const glob = promisify(require('glob'));
const fs = require('fs').promises;
const path = require('path');

async function run() {
    // Resolve the `package.json` at the current working directory.
    const pck = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));

    // Resolve the directory for which to download the plugins.
    const pluginsDir = pck.theiaPluginsDir || 'plugins';

    // Move all the plugins from pluginsDir into /lib/frontend/hostedPlugin
    const plugins = await glob(`${pluginsDir}/**/*`, { nodir: true });
    for (const plugin of plugins) {
        const target = path.join('lib', 'frontend', 'hostedPlugin', path.relative(pluginsDir, plugin));
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(plugin, target);
    }
}

run();
