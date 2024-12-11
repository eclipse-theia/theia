const cp = require('child_process');

console.log('Extracting all localization calls...');
performNlsExtract();
if (hasNlsFileChanged()) {
    const token = getDeepLToken();
    if (token) {
        console.log('Performing DeepL translation...');
        performDeepLTranslation(token);
        console.log('Translation finished successfully!');
    } else {
        console.log('No DeepL API token found in env');
        process.exit(1);
    }
} else {
    console.log('No localization changes found.');
}

function performNlsExtract() {
    cp.spawnSync('yarn', [
        'theia', 'nls-extract',
        '-o', './packages/core/i18n/nls.json',
        '-e', 'vscode',
        '-f', './packages/**/browser/**/*.{ts,tsx}'
    ], {
        shell: true,
        stdio: 'inherit'
    });
}

function hasNlsFileChanged() {
    const childProcess = cp.spawnSync('git', ['diff', '--exit-code', './packages/core/i18n/nls.json']);
    return childProcess.status === 1;
}

function getDeepLToken() {
    return process.env['DEEPL_API_TOKEN'];
}

function performDeepLTranslation(token) {
    const childProcess = cp.spawnSync('yarn', [
        'theia', 'nls-localize',
        '-f', './packages/core/i18n/nls.json',
        '--free-api', '-k', token
    ], {
        shell: true,
        stdio: 'inherit'
    });
    if (childProcess.status !== 0) {
        console.error('DeepL translation failed');
        process.exit(1);
    }
}
