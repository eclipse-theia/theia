// tslint:disable:file-header
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Based on: https://github.com/Microsoft/vscode/blob/dd3e2d94f81139f9d18ba15a24c16c6061880b93/extensions/git/src/askpass.ts

import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import * as path from 'path';
import * as http from 'http';
import { ILogger } from '@theia/core/lib/common/logger';
import { Disposable } from '@theia/core/lib/common/disposable';
import { MaybePromise } from '@theia/core/lib/common/types';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { GitPrompt } from '../../common/git-prompt';
import { DugiteGitPromptServer } from '../../node/dugite-git-prompt';
import { AddressInfo } from 'net';

/**
 * Environment for the Git askpass helper.
 */
export interface AskpassEnvironment {

    /**
     * The path to the external script to run by Git when authentication is required.
     */
    readonly GIT_ASKPASS: string;

    /**
     * Starts the process as a normal Node.js process. User `"1"` if you want to enable it.
     */
    readonly ELECTRON_RUN_AS_NODE?: string;

    /**
     * The path to the Node.js executable that will run the external `ASKPASS` script.
     */
    readonly THEIA_GIT_ASKPASS_NODE?: string;

    /**
     * The JS file to run.
     */
    readonly THEIA_GIT_ASKPASS_MAIN?: string;

    /**
     * The Git askpass handle path. In our case, this is the address of the HTTP server listening on the `Username` and `Password` requests.
     */
    readonly THEIA_GIT_ASKPASS_HANDLE?: string;

}

export interface Address {
    readonly port: number;
    readonly family: string;
    readonly address: string;
}

@injectable()
export class Askpass implements Disposable {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(DugiteGitPromptServer)
    protected readonly promptServer: DugiteGitPromptServer;

    protected server: http.Server;
    protected serverAddress: Address | undefined;
    protected ready = new Deferred<boolean>();

    @postConstruct()
    protected init(): void {
        this.server = http.createServer((req, res) => this.onRequest(req, res));
        this.setup().then(serverAddress => {
            if (serverAddress) {
                this.serverAddress = serverAddress;
                const { address, port } = this.serverAddress;
                this.logger.info(`Git askpass helper is listening on http://${address}:${port}.`);
                this.ready.resolve(true);
            } else {
                this.logger.warn("Couldn't start the HTTP server for the Git askpass helper.");
                this.ready.resolve(false);
            }
        }).catch(() => {
            this.ready.resolve(false);
        });
    }

    protected async setup(): Promise<Address | undefined> {
        try {
            return new Promise<Address>(resolve => {
                this.server.on('error', err => this.logger.error(err));
                this.server.listen(0, this.hostname(), () => {
                    resolve(this.server.address() as AddressInfo);
                });
            });
        } catch (err) {
            this.logger.error('Could not launch Git askpass helper.', err);
            return undefined;
        }
    }

    protected onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        const chunks: string[] = [];
        req.setEncoding('utf8');
        req.on('data', (d: string) => chunks.push(d));
        req.on('end', () => {
            const { gitRequest, gitHost } = JSON.parse(chunks.join(''));
            this.prompt(gitHost, gitRequest).then(result => {
                res.writeHead(200);
                res.end(JSON.stringify(result));
            }, err => {
                this.logger.error(err);
                res.writeHead(500);
                res.end();
            });
        });
    }

    protected async prompt(requestingHost: string, request: string): Promise<string> {
        try {
            const answer = await this.promptServer.ask({
                password: /password/i.test(request),
                text: request,
                details: `Git: ${requestingHost} (Press 'Enter' to confirm or 'Escape' to cancel.)`
            });
            if (GitPrompt.Success.is(answer) && typeof answer.result === 'string') {
                return answer.result;
            } else if (GitPrompt.Cancel.is(answer)) {
                return '';
            } else if (GitPrompt.Failure.is(answer)) {
                const { error } = answer;
                throw error;
            }
            throw new Error('Unexpected answer.'); // Do not ever log the `answer`, it might contain the password.
        } catch (e) {
            this.logger.error(`An unexpected error occurred when requesting ${request} by ${requestingHost}.`, e);
            return '';
        }
    }

    async getEnv(): Promise<AskpassEnvironment> {
        const ok = await this.ready.promise;
        if (!ok) {
            return {
                GIT_ASKPASS: path.join(__dirname, '..', '..', '..', 'src', 'electron-node', 'askpass', 'askpass-empty.sh')
            };
        }

        const [
            ELECTRON_RUN_AS_NODE,
            GIT_ASKPASS,
            THEIA_GIT_ASKPASS_NODE,
            THEIA_GIT_ASKPASS_MAIN,
            THEIA_GIT_ASKPASS_HANDLE
        ] = await Promise.all([
            this.ELECTRON_RUN_AS_NODE(),
            this.GIT_ASKPASS(),
            this.THEIA_GIT_ASKPASS_NODE(),
            this.THEIA_GIT_ASKPASS_MAIN(),
            this.THEIA_GIT_ASKPASS_HANDLE()
        ]);

        return {
            ELECTRON_RUN_AS_NODE,
            GIT_ASKPASS,
            THEIA_GIT_ASKPASS_NODE,
            THEIA_GIT_ASKPASS_MAIN,
            THEIA_GIT_ASKPASS_HANDLE
        };
    }

    dispose(): void {
        this.server.close();
    }

    protected hostname(): string {
        return 'localhost';
    }

    protected GIT_ASKPASS(): MaybePromise<string> {
        return path.join(__dirname, '..', '..', '..', 'src', 'electron-node', 'askpass', 'askpass.sh');
    }

    protected ELECTRON_RUN_AS_NODE(): MaybePromise<string | undefined> {
        return '1';
    }

    protected THEIA_GIT_ASKPASS_NODE(): MaybePromise<string | undefined> {
        return process.execPath;
    }

    protected THEIA_GIT_ASKPASS_MAIN(): MaybePromise<string | undefined> {
        return path.join(__dirname, 'askpass-main.js');
    }

    protected THEIA_GIT_ASKPASS_HANDLE(): MaybePromise<string | undefined> {
        if (this.serverAddress) {
            return `http://${this.hostname()}:${this.serverAddress.port}`;
        }
        return undefined;
    }

}
