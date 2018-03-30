/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import * as express from 'express';
import { injectable, inject } from "inversify";
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { HostedExtensionServer, HostedExtensionClient, Extension } from '../common/extension-protocol';
import { HostedExtensionReader } from './extension-reader';
import { HostedExtensionSupport } from './hosted-extension';

const extensionPath = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + './theia/extensions/';

@injectable()
export class ExtensionApiContribution implements BackendApplicationContribution {
    configure(app: express.Application): void {
        app.get('/extension/:path(*)', (req, res) => {
            const filePath: string = req.params.path;
            res.sendFile(extensionPath + filePath);
        });
    }
}

@injectable()
export class HostedExtensionServerImpl implements HostedExtensionServer {

    constructor( @inject(HostedExtensionReader) private readonly reader: HostedExtensionReader,
        @inject(HostedExtensionSupport) private readonly hostedExtension: HostedExtensionSupport) {
    }

    dispose(): void {
        this.hostedExtension.clientClosed();
    }
    setClient(client: HostedExtensionClient): void {
        this.hostedExtension.setClient(client);
    }
    getHostedExtension(): Promise<Extension | undefined> {
        const ext = this.reader.getExtension();
        if (ext) {
            this.hostedExtension.runExtension(ext);
        }
        return Promise.resolve(this.reader.getExtension());
    }

    onMessage(message: string): Promise<void> {
        this.hostedExtension.onMessage(message);
        return Promise.resolve();
    }
}
