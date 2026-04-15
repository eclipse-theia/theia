const vscode = require('vscode');

exports.activate = function (context) {
    console.log('[sample-browser-plugin] activated in browser worker!');
    const disposable = vscode.commands.registerCommand('sample-browser-plugin.hello', function () {
        vscode.window.showInformationMessage('Hello from a browser-only extension!');
    });
    context.subscriptions.push(disposable);
};

exports.deactivate = function () { };
