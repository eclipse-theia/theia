import * as path from "path";
import * as child_process from "child_process";

describe('Languages', function () {

    describe('#textDocuments', function () {
        it('didOpen', function () {
            const appPath = path.resolve(__dirname, '../../../../lib/languages/node/test/mock-app.js');
            const appProcess = child_process.spawn('node', [appPath]);
            appProcess.stdout.on('data', data => {
                console.log(`App: ${data}`);
            });
            appProcess.stderr.on('data', data => {
                console.error(`App: ${data}`);
            });
            appProcess.on('error', reason => {
                console.error('Failed to start the app process: ' + reason)
            });
            appProcess.on('close', code => {
                console.log(`the app process exited with code ${code}`);
            });
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve()
                }, 5000)
            })
        });
    });

});