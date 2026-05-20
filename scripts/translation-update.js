const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const NLS_FILE = './packages/core/i18n/nls.json';

console.log('Extracting all localization calls...');
const previousNls = readNlsFile();
performNlsExtract();
if (hasNlsFileChanged()) {
    const token = getDeepLToken();
    if (token) {
        const currentNls = readNlsFile();
        const changedKeys = getChangedKeys(previousNls, currentNls);
        if (changedKeys.length > 0) {
            console.log(`Detected ${changedKeys.length} changed source string(s): ${changedKeys.join(', ')}`);
        }
        console.log('Performing DeepL translation...');
        performDeepLTranslation(token, changedKeys);
        console.log('Translation finished successfully!');
    } else {
        console.log('No DeepL API token found in env');
        process.exit(1);
    }
} else {
    console.log('No localization changes found.');
}

function performNlsExtract() {
    cp.spawnSync('npx', [
        'theia', 'nls-extract',
        '-o', NLS_FILE,
        '-e', 'vscode',
        '-f', './packages/**/{browser,electron-browser,common}/**/*.{ts,tsx}'
    ], {
        shell: true,
        stdio: 'inherit'
    });
}

function hasNlsFileChanged() {
    const childProcess = cp.spawnSync('git', ['diff', '--exit-code', NLS_FILE]);
    return childProcess.status === 1;
}

function getDeepLToken() {
    return process.env['DEEPL_API_TOKEN'];
}

function readNlsFile() {
    try {
        return JSON.parse(fs.readFileSync(path.resolve(NLS_FILE), 'utf-8'));
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return {};
        }
        console.error(`Failed to read or parse ${NLS_FILE}:`, error);
        process.exit(1);
    }
}

function getChangedKeys(previous, current, prefix = '') {
    const changed = [];
    if (!previous || typeof previous !== 'object') {
        return changed;
    }
    for (const [key, value] of Object.entries(current)) {
        const currentPath = prefix ? `${prefix}/${key}` : key;
        if (typeof value === 'string') {
            if (key in previous && typeof previous[key] === 'string' && previous[key] !== value) {
                changed.push(currentPath);
            }
        } else if (typeof value === 'object' && value !== null) {
            changed.push(...getChangedKeys(previous[key], value, currentPath));
        }
    }
    return changed;
}

function performDeepLTranslation(token, changedKeys) {
    const args = [
        'theia', 'nls-localize',
        '-f', NLS_FILE,
        '--free-api', '-k', token
    ];
    if (changedKeys && changedKeys.length > 0) {
        args.push('--force-retranslate', changedKeys.join(','));
    }
    const childProcess = cp.spawnSync('npx', args, {
        shell: true,
        stdio: 'inherit'
    });
    if (childProcess.status !== 0) {
        console.error('DeepL translation failed');
        process.exit(1);
    }
}
