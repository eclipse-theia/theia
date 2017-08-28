/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as stream from 'stream';
import { injectable, inject } from 'inversify';
import URI from "@theia/core/lib/common/uri";
import { ILogger } from "@theia/core/lib/common";
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { openSocket } from '@theia/core/lib/node';
import { ShellProcess, ShellProcessFactory } from './shell-process'

@injectable()
export class TerminalBackendContribution implements BackendApplicationContribution {
    private terminals: Map<number, ShellProcess> = new Map()

    constructor( @inject(ShellProcessFactory) protected readonly shellFactory: ShellProcessFactory,
        @inject(ILogger) protected readonly logger: ILogger) {
    }

    configure(app: express.Application): void {
        app.post('/services/terminals', bodyParser.json({ type: 'application/json' }), (req, res) => {
            const cols = parseInt(req.query.cols, 10);
            const rows = parseInt(req.query.rows, 10);
            let term: ShellProcess;
            try {
                term = this.shellFactory({ 'cols': cols, 'rows': rows });

                term.onError(error => {
                    this.logger.error(`Terminal pid: ${term.pid} error: ${error}, closing it.`);
                    this.closeTerminal(term);
                });

                const root: { uri?: string } | undefined = req.body;
                if (root && root.uri) {
                    const uri = new URI(root.uri);
                    term.write(`cd ${uri.path} && `);
                    term.write("source ~/.profile\n");
                }

                const pid = term.pid;
                this.terminals.set(pid, term);
                res.send(pid.toString());
                res.end();
            } catch (error) {
                this.logger.error(`Error while creating terminal: ${error}`);
                res.send(-1);
                res.end();
            }
        });

        app.post('/services/terminals/:pid/size', (req, res) => {
            let pid = parseInt(req.params.pid, 10),
                cols = parseInt(req.query.cols, 10),
                rows = parseInt(req.query.rows, 10),
                term = this.terminals.get(pid)
            if (term) {
                term.resize(cols, rows);
            } else {
                console.error("Couldn't resize terminal " + pid + ", because it doesn't exist.")
            }
            res.end();
        });
    }

    onStart(server: http.Server): void {
        openSocket({
            server,
            matches: (request) => {
                const uri = new URI(request.url!)
                return uri.path.toString().startsWith('/services/terminals/')
            }
        }, (ws, request) => {
            const uri = new URI(request.url!)
            const pid = parseInt(uri.path.base, 10)
            const term = this.terminals.get(pid)
            if (!term) {
                return;
            }

            const termStream = new stream.PassThrough();

            termStream.on('data', (data: any) => {
                try {
                    ws.send(data.toString());
                } catch (ex) {
                    console.error(ex)
                }
            });

            term.output.pipe(termStream);

            ws.on('message', (msg: any) => {
                term.write(msg)
            })
            ws.on('close', (msg: any) => {
                this.closeTerminal(term);
            })
        })
    }

    protected closeTerminal(term: ShellProcess) {
        this.terminals.delete(term.pid);
        term.dispose();
    }
}
