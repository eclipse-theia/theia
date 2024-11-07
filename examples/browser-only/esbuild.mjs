/**
 * This file can be edited to the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch } from './gen-esbuild.browser.mjs';
import esbuild from 'esbuild';

const browserContext = await esbuild.context(browserOptions);

if (watch) {
    await browserContext.watch();
} else {
    try {
        await browserContext.rebuild();
        await browserContext.dispose();
    } catch (err) {
        process.exit(1);
    }
}
