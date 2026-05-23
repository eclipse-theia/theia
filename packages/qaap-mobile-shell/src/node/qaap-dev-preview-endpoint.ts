// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import * as http from 'http';
import * as net from 'net';
import {
    QAAP_DEV_PREVIEW_PREFIX,
    QAAP_DEV_PREVIEW_PROBE_PATH,
    buildQaapDevPreviewOpenUrl,
    isAllowedDevPreviewPort,
    parseQaapDevPreviewPort,
    parseQaapDevPreviewRequestPath,
    type QaapDevPreviewProbeResponse,
} from '../common/qaap-dev-preview';
import { normalizeQaapPublicUrl } from './qaap-github-oauth-config';

const PROBE_TIMEOUT_MS = 2500;
const PROXY_TARGET_HOST = '127.0.0.1';

function getQaapBackendListenPort(): number {
    const parsed = Number(process.env.PORT);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
}

@injectable()
export class QaapDevPreviewEndpoint implements BackendApplicationContribution {

    configure(app: Application): void {
        app.get(`${QAAP_DEV_PREVIEW_PROBE_PATH}/:port`, (req, res) => {
            void this.handleProbe(req, res);
        });
        app.use(`${QAAP_DEV_PREVIEW_PREFIX}/:port`, (req, res) => {
            this.handleProxy(req, res);
        });
    }

    onStart(server: http.Server): void {
        server.on('upgrade', (req, socket, head) => {
            this.handleWebSocketUpgrade(req, socket as net.Socket, head);
        });
    }

    protected async handleProbe(req: Request, res: Response): Promise<void> {
        const port = parseQaapDevPreviewPort(req.params.port);
        const origin = this.resolvePublicOrigin(req);
        if (port === undefined) {
            res.status(400).json({ ready: false, previewUrl: '' } satisfies QaapDevPreviewProbeResponse);
            return;
        }
        if (this.isIdeListenPort(port)) {
            res.json({ ready: false, previewUrl: buildQaapDevPreviewOpenUrl(origin, port) } satisfies QaapDevPreviewProbeResponse);
            return;
        }
        const ready = await this.probeLocalDevServer(port);
        const body: QaapDevPreviewProbeResponse = {
            ready,
            previewUrl: buildQaapDevPreviewOpenUrl(origin, port),
        };
        res.json(body);
    }

    protected handleProxy(req: Request, res: Response): void {
        const port = parseQaapDevPreviewPort(req.params.port);
        if (port === undefined) {
            res.status(400).send('Invalid dev preview port');
            return;
        }
        if (this.isIdeListenPort(port)) {
            res.status(403).type('text/plain').send('Cannot proxy the Qaap IDE port. Use a different dev-server port.');
            return;
        }
        const targetPath = req.url || '/';
        this.forwardHttp(req, res, port, targetPath);
    }

    protected handleWebSocketUpgrade(
        req: http.IncomingMessage,
        socket: net.Socket,
        head: Buffer,
    ): void {
        const pathname = (req.url ?? '').split('?')[0];
        const parsed = parseQaapDevPreviewRequestPath(pathname);
        if (!parsed || this.isIdeListenPort(parsed.port)) {
            return;
        }
        const query = (req.url ?? '').includes('?') ? (req.url ?? '').slice((req.url ?? '').indexOf('?')) : '';
        const path = `${parsed.targetPath}${query}`;
        const headers = { ...req.headers, host: `${PROXY_TARGET_HOST}:${parsed.port}` };
        const proxyReq = http.request({
            hostname: PROXY_TARGET_HOST,
            port: parsed.port,
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
        proxyReq.on('error', () => {
            socket.destroy();
        });
        proxyReq.end();
    }

    protected forwardHttp(incoming: Request, outgoing: Response, targetPort: number, targetPath: string): void {
        const headers: http.OutgoingHttpHeaders = { ...incoming.headers };
        headers.host = `${PROXY_TARGET_HOST}:${targetPort}`;
        delete headers.connection;

        const proxyReq = http.request({
            hostname: PROXY_TARGET_HOST,
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
                outgoing.status(502).type('text/plain').send(
                    `Dev server not reachable on 127.0.0.1:${targetPort}. Start the dev script in the terminal.`,
                );
            } else {
                outgoing.end();
            }
        });
        incoming.pipe(proxyReq);
    }

    protected isIdeListenPort(port: number): boolean {
        return port === getQaapBackendListenPort();
    }

    protected probeLocalDevServer(port: number): Promise<boolean> {
        if (!isAllowedDevPreviewPort(port) || this.isIdeListenPort(port)) {
            return Promise.resolve(false);
        }
        return new Promise(resolve => {
            const req = http.get({
                host: PROXY_TARGET_HOST,
                port,
                path: '/',
                timeout: PROBE_TIMEOUT_MS,
            }, res => {
                res.resume();
                resolve((res.statusCode ?? 0) > 0);
            });
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.on('error', () => resolve(false));
        });
    }

    protected resolvePublicOrigin(req: Request): string {
        const envUrl = process.env.QAAP_OAUTH_PUBLIC_URL?.trim();
        if (envUrl) {
            return normalizeQaapPublicUrl(envUrl);
        }
        const proto = this.firstHeaderValue(req.headers['x-forwarded-proto']) ?? req.protocol ?? 'http';
        const host = this.firstHeaderValue(req.headers['x-forwarded-host']) ?? req.get('host') ?? 'localhost';
        return normalizeQaapPublicUrl(`${proto}://${host}`);
    }

    protected firstHeaderValue(value: string | string[] | undefined): string | undefined {
        if (Array.isArray(value)) {
            return value[0]?.split(',')[0]?.trim();
        }
        return value?.split(',')[0]?.trim();
    }
}
