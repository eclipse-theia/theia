/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { injectable } from "inversify";
import * as express from 'express';
import * as fs from 'fs';
import { Extension } from '../common/extension-protocol';
import { resolve } from 'path';

@injectable()
export class HostedExtensionReader implements BackendApplicationContribution {
    private extension: Extension | undefined;
    private extensionPath: string;

    initialize(): void {
        if (process.env.HOSTED_PLUGIN) {
            let extensionPath = process.env.HOSTED_PLUGIN;
            if (extensionPath) {
                if (!extensionPath.endsWith('/')) {
                    extensionPath += '/';
                }
                this.extensionPath = extensionPath;
                this.handleExtension(extensionPath);
            }
        }
    }

    configure(app: express.Application): void {
        app.get('/hostedExtension/:path(*)', (req, res) => {
            const filePath: string = req.params.path;
            res.sendFile(this.extensionPath + filePath);
        });
    }

    private handleExtension(path: string): void {
        if (!path.endsWith('/')) {
            path += '/';
        }
        const packageJsonPath = path + 'package.json';
        if (fs.existsSync(packageJsonPath)) {
            const extension: Extension = require(packageJsonPath);
            this.extension = extension;
            if (extension.theiaExtension.node) {
                extension.theiaExtension.node = resolve(path, extension.theiaExtension.node);
            }
        } else {
            this.extension = undefined;
        }
    }

    getExtension(): Extension | undefined {
        return this.extension;
    }
}
