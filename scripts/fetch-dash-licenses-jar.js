#!/usr/bin/env node
// @ts-check

/**
 * Pre-download the dash-licenses JAR into the location expected by
 * @eclipse-dash/nodejs-wrapper.
 *
 * The wrapper's built-in downloader points at a Nexus 2 URL that no longer
 * resolves after repo.eclipse.org's Nexus 3 upgrade, so we fetch the JAR
 * ourselves from the Nexus 3 snapshots repo. We pin to 1.1.1-SNAPSHOT because
 * 1.0.2 / 1.1.0 misclassify workspace packages (link:true with no version) as
 * restricted.
 *
 * See:
 *   - https://github.com/eclipse-dash/nodejs-wrapper/issues/7
 *   - https://github.com/eclipse-dash/dash-licenses/issues/534
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_BASE =
    'https://repo.eclipse.org/repository/dash-maven2-snapshots/org/eclipse/dash/org.eclipse.dash.licenses/1.1.1-SNAPSHOT';
const JAR_PATH = path.resolve(
    __dirname,
    '..',
    'node_modules/@eclipse-dash/nodejs-wrapper/download/dash-licenses.jar'
);

main().catch(err => {
    console.error(err);
    process.exit(1);
});

async function main() {
    if (fs.existsSync(JAR_PATH) && fs.statSync(JAR_PATH).size > 1_000_000) {
        console.info(`dash-licenses JAR already present at ${JAR_PATH}`);
        return;
    }
    fs.mkdirSync(path.dirname(JAR_PATH), { recursive: true });
    const metadata = (await httpGet(`${SNAPSHOT_BASE}/maven-metadata.xml`)).toString('utf8');
    const versions = [...metadata.matchAll(/<value>(1\.1\.1-[^<]+)<\/value>/g)].map(m => m[1]);
    if (versions.length === 0) {
        throw new Error('Could not resolve dash-licenses snapshot version from maven-metadata.xml');
    }
    const version = versions[versions.length - 1];
    console.info(`Downloading dash-licenses ${version}...`);
    const jar = await httpGet(`${SNAPSHOT_BASE}/org.eclipse.dash.licenses-${version}.jar`);
    if (jar.length < 1_000_000) {
        throw new Error(`Downloaded JAR looks invalid (${jar.length} bytes)`);
    }
    fs.writeFileSync(JAR_PATH, jar);
    console.info(`Wrote ${JAR_PATH} (${jar.length} bytes)`);
}

/**
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
function httpGet(url, redirects = 5) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https:') ? require('https') : require('http');
        lib.get(url, res => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (redirects <= 0) {
                    reject(new Error(`Too many redirects fetching ${url}`));
                    return;
                }
                res.resume();
                resolve(httpGet(new URL(res.headers.location, url).toString(), redirects - 1));
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`GET ${url} failed: HTTP ${res.statusCode}`));
                res.resume();
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}
