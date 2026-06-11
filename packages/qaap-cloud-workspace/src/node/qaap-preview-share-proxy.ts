// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { Application, Request, Response } from '@theia/core/shared/express';
import * as http from 'http';
import * as net from 'net';
import {
    isAllowedDevPreviewPort,
    parseQaapDevPreviewPort,
} from '@theia/qaap-mobile-shell/lib/common/qaap-dev-preview';
import { QaapDevPreviewTargetHostResolver } from '@theia/qaap-mobile-shell/lib/node/qaap-dev-preview-target-host';
import { QAAP_DEV_PREVIEW_PUBLIC_PREFIX, parseQaapPublicPreviewSharePath } from '../common/qaap-preview-share';
import { QaapPreviewShareStore } from './qaap-preview-share-store';

@injectable()
export class QaapPreviewShareProxyContribution implements BackendApplicationContribution {

    @inject(QaapPreviewShareStore)
    protected readonly shares: QaapPreviewShareStore;

    protected readonly targetHostResolver = new QaapDevPreviewTargetHostResolver();

    configure(app: Application): void {
        app.use(`${QAAP_DEV_PREVIEW_PUBLIC_PREFIX}/:token`, (req, res) => {
            void this.handleProxy(req, res);
        });
    }

    onStart(server: http.Server): void {
        server.on('upgrade', (req, socket, head) => {
            void this.handleWebSocketUpgrade(req, socket as net.Socket, head);
        });
    }

    protected async handleProxy(req: Request, res: Response): Promise<void> {
        const token = typeof req.params.token === 'string' ? req.params.token : '';
        const entry = await this.shares.resolve(token);
        if (!entry) {
            res.status(404).type('text/plain').send('Preview share link expired or unknown.');
            return;
        }
        const port = parseQaapDevPreviewPort(entry.port);
        if (port === undefined || !isAllowedDevPreviewPort(port)) {
            res.status(400).send('Invalid preview port');
            return;
        }
        await this.forwardHttp(req, res, port, req.url || '/');
    }

    protected async handleWebSocketUpgrade(
        req: http.IncomingMessage,
        socket: net.Socket,
        head: Buffer,
    ): Promise<void> {
        const pathname = (req.url ?? '').split('?')[0];
        const parsed = parseQaapPublicPreviewSharePath(pathname);
        if (!parsed) {
            return;
        }
        const entry = await this.shares.resolve(parsed.token);
        if (!entry) {
            socket.destroy();
            return;
        }
        const port = parseQaapDevPreviewPort(entry.port);
        if (port === undefined) {
            socket.destroy();
            return;
        }
        const query = (req.url ?? '').includes('?') ? (req.url ?? '').slice((req.url ?? '').indexOf('?')) : '';
        const path = `${parsed.targetPath}${query}`;
        const targetHost = await this.targetHostResolver.resolve(port);
        if (!targetHost) {
            socket.destroy();
            return;
        }
        // `localhost` keeps dev-server host checks happy regardless of loopback family.
        const headers = { ...req.headers, host: `localhost:${port}` };
        const proxyReq = http.request({
            hostname: targetHost,
            port,
            path,
            method: req.method,
            headers,
        });
        proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
            const headerLines = Object.entries(proxyRes.headers)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
            socket.write(
                `HTTP/1.1 ${proxyRes.statusCode ?? 101} ${proxyRes.statusMessage ?? 'Switching Protocols'}\r\n`
                + `${headerLines.join('\r\n')}\r\n\r\n`,
            );
            if (head.length > 0) {
                proxySocket.write(head);
            }
            if (proxyHead.length > 0) {
                proxySocket.write(proxyHead);
            }
            proxySocket.pipe(socket);
            socket.pipe(proxySocket);
        });
        proxyReq.on('error', () => socket.destroy());
        proxyReq.end();
    }

    protected async forwardHttp(incoming: Request, outgoing: Response, targetPort: number, targetPath: string): Promise<void> {
        const targetHost = await this.targetHostResolver.resolve(targetPort);
        if (!targetHost) {
            outgoing.status(502).type('text/plain').send('Dev preview is not running.');
            return;
        }
        const headers: http.OutgoingHttpHeaders = { ...incoming.headers };
        headers.host = `localhost:${targetPort}`;
        delete headers.connection;
        const proxyReq = http.request({
            hostname: targetHost,
            port: targetPort,
            path: targetPath,
            method: incoming.method,
            headers,
        }, proxyRes => {
            outgoing.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(outgoing);
        });
        proxyReq.on('error', () => {
            if (!outgoing.headersSent) {
                outgoing.status(502).type('text/plain').send('Dev preview is not running.');
            } else {
                outgoing.end();
            }
        });
        incoming.pipe(proxyReq);
    }
}
