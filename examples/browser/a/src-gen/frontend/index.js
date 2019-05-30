// @ts-check
require('es6-promise/auto');
require('reflect-metadata');
const { Container } = require('inversify');
const { FrontendApplication } = require('@theia/core/lib/browser');
const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
const { messagingFrontendModule } = require('@theia/core/lib/browser/messaging/messaging-frontend-module');
const { loggerFrontendModule } = require('@theia/core/lib/browser/logger-frontend-module');
const { ThemeService } = require('@theia/core/lib/browser/theming');
const { FrontendApplicationConfigProvider } = require('@theia/core/lib/browser/frontend-application-config-provider');

FrontendApplicationConfigProvider.set({
    "applicationName": "Theia Browser Example",
    "preferences": {
        "files.enableTrash": false
    }
});

const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    )
}

function start() {
    const themeService = ThemeService.get();
    themeService.loadUserTheme();

    const application = container.get(FrontendApplication);
    application.start();
}

module.exports = Promise.resolve()
    .then(function () { return Promise.resolve(require('@theia/core/lib/browser/menu/browser-menu-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/core/lib/browser/window/browser-window-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/core/lib/browser/keyboard/browser-keyboard-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/output/lib/browser/output-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/filesystem/lib/browser/filesystem-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/filesystem/lib/browser/download/file-download-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/filesystem/lib/browser/file-dialog/file-dialog-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/variable-resolver/lib/browser/variable-resolver-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/workspace/lib/browser/workspace-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/languages/lib/browser/languages-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/editor/lib/browser/editor-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/navigator/lib/browser/navigator-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/markers/lib/browser/problem/problem-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/outline-view/lib/browser/outline-view-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/monaco/lib/browser/monaco-browser-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/callhierarchy/lib/browser/callhierarchy-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/console/lib/browser/console-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/json/lib/browser/json-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/userstorage/lib/browser/user-storage-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/preferences/lib/browser/preference-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/terminal/lib/browser/terminal-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/task/lib/browser/task-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/cpp/lib/browser/cpp-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/debug/lib/browser/debug-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/editor-preview/lib/browser/editor-preview-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/editorconfig/lib/browser/editorconfig-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/file-search/lib/browser/file-search-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/keymaps/lib/browser/keymaps-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/getting-started/lib/browser/getting-started-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/scm/lib/browser/scm-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/git/lib/browser/git-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/git/lib/browser/prompt/git-prompt-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/java/lib/browser/java-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/java-debug/lib/browser/java-debug-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/merge-conflicts/lib/browser/merge-conflicts-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/messages/lib/browser/messages-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/mini-browser/lib/browser/mini-browser-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/search-in-workspace/lib/browser/search-in-workspace-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/plugin-ext/lib/plugin-ext-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/plugin-ext-vscode/lib/browser/plugin-vscode-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/preview/lib/browser/preview-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/python/lib/browser/python-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/textmate-grammars/lib/browser/textmate-grammars-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/typehierarchy/lib/browser/typehierarchy-frontend-module')).then(load) })
    .then(function () { return Promise.resolve(require('@theia/typescript/lib/browser/typescript-frontend-module')).then(load) })
    .then(start).catch(reason => {
        console.error('Failed to start the frontend application.');
        if (reason) {
            console.error(reason);
        }
    });