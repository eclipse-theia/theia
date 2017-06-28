/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as http from 'http';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import { injectable } from 'inversify';
import URI from "../../application/common/uri";
import { isWindows } from "../../application/common";
import { BackendApplicationContribution } from '../../application/node';
import { openSocket } from '../../messaging/node';

const pty = require("node-pty");

@injectable()
export class TerminalBackendContribution implements BackendApplicationContribution {
    private terminals: Map<number, any> = new Map()

    private getShellExecutablePath(): string {
        if (isWindows) {
            return 'cmd.exe';
        } else {
            return process.env.SHELL!;
        }
    }

    configure(app: express.Application): void {
        app.post('/services/terminals', bodyParser.json({ type: 'application/json' }), (req, res) => {
            const cols = parseInt(req.query.cols, 10);
            const rows = parseInt(req.query.rows, 10);
            const term = pty.spawn(this.getShellExecutablePath(), [], {
                name: 'xterm-color',
                cols: cols || 80,
                rows: rows || 24,
                cwd: process.env.PWD,
                env: process.env
            });

            const root: { uri?: string } | undefined = req.body;
            if (root && root.uri) {
                const uri = new URI(root.uri);
                term.write(`cd ${uri.path} && `);
                term.write("source ~/.profile\n");
            }

            this.terminals.set(term.pid, term);
            res.send(term.pid.toString());
            res.end();
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
            term.on('data', (data: any) => {
                try {
                    ws.send(data)
                } catch (ex) {
                    console.error(ex)
                }
            })
            ws.on('message', (msg: any) => {
                term.write(msg)
            })
            ws.on('close', (msg: any) => {
                term.kill()
                this.terminals.delete(pid)
            })
        })
    }
}
