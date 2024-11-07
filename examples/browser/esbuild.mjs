/**
 * This file can be edited to the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';
import esbuild from 'esbuild';

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);

if (watch) {
    await Promise.all([
        browserContext.watch(),
        nodeContext.watch()
    ]);
} else {
    try {
        await Promise.all([
            browserContext.rebuild(),
            nodeContext.rebuild()
        ]);
        await Promise.all([
            browserContext.dispose(),
            nodeContext.dispose()
        ]);
    } catch (err) {
        process.exit(1);
    }
}
