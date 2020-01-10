// tslint:disable:file-header
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Based on: https://github.com/Microsoft/vscode/blob/dd3e2d94f81139f9d18ba15a24c16c6061880b93/extensions/git/src/askpass-main.ts.

import * as url from 'url';
import * as http from 'http';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fatal(err: any): void {
    console.error('Missing or invalid credentials.');
    console.error(err);
    process.exit(1);
}

// 1. Node.js executable path. In this particular case it is Electron.
// 2. The location of the corresponding JS file of the current (`__filename`) file.
// 3. `Username`/`Password`.
// 4. `for`.
// 5. The host. For example: `https://github.com`.
const expectedArgvCount = 5;

function main(argv: string[]): void {

    if (argv.length !== expectedArgvCount) {
        fatal(`Wrong number of arguments. Expected ${expectedArgvCount}. Got ${argv.length} instead.`);
        return;
    }

    if (!process.env['THEIA_GIT_ASKPASS_HANDLE']) {
        fatal("Missing 'THEIA_GIT_ASKPASS_HANDLE' handle.");
        return;
    }

    const handle = process.env['THEIA_GIT_ASKPASS_HANDLE'] as string;
    const { host, hostname, port, protocol } = url.parse(handle);
    const gitRequest = argv[2];
    const gitHost = argv[4].substring(1, argv[4].length - 2);

    const opts: http.RequestOptions = {
        host,
        hostname,
        port,
        protocol,
        path: '/',
        method: 'POST'
    };

    const req = http.request(opts, res => {
        if (res.statusCode !== 200) {
            fatal(`Bad status code: ${res.statusCode}.`);
            return;
        }

        const chunks: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (d: string) => chunks.push(d));
        res.on('end', () => {
            const raw = chunks.join('');

            try {
                const result = JSON.parse(raw);
                process.stdout.write(result);
            } catch (err) {
                fatal('Error parsing the response.');
                return;
            }

            setTimeout(() => process.exit(0), 0);
        });
    });

    req.on('error', err => fatal(err));
    req.write(JSON.stringify({ gitRequest, gitHost }));
    req.end();
}

main(process.argv);
