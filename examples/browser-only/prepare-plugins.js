const { promisify } = require('util');
const glob = promisify(require('glob'));
const fs = require('fs').promises;
const path = require('path');

async function run() {
    // Resolve the `package.json` at the current working directory.
    const pck = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));

    // Resolve the directory for which to download the plugins.
    const pluginsDir = pck.theiaPluginsDir || 'extension';

    // Find all `plugin/extension/*` directories.
    const plugins = await glob(`${pluginsDir}/*/extension`);

    for (const pluginExtensionPath of plugins) {
        // Extract the plugin name from the parent folder of the extension.
        const pluginName = path.basename(path.dirname(pluginExtensionPath)).replace(/[.\-]/g, '_');
        const targetDir = path.join('lib', 'frontend', 'hostedPlugin', pluginName);

        // Ensure the target directory exists.
        await fs.mkdir(targetDir, { recursive: true });

        // Copy the content of the `extension` folder to the target directory.
        const files = await glob(`${pluginExtensionPath}/**/*`, { nodir: true });
        for (const file of files) {
            const relativePath = path.relative(pluginExtensionPath, file);
            const target = path.join(targetDir, relativePath);

            // Ensure the target directory structure exists.
            await fs.mkdir(path.dirname(target), { recursive: true });

            // Copy the file.
            await fs.copyFile(file, target);
        }
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
