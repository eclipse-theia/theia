// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { BackendApplicationContribution } from '@theia/core/lib/node';
import * as express from '@theia/core/shared/express';
import * as fs from 'fs';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { OVSXMockClient, VSXExtensionRaw } from '@theia/ovsx-client';
import * as path from 'path';
import { SampleAppInfo } from '../common/vsx/sample-app-info';
import * as http from 'http';
import * as https from 'https';
import { Deferred } from '@theia/core/lib/common/promise-util';

type VersionedId = `${string}.${string}@${string}`;

/**
 * This class implements a very crude OpenVSX mock server for testing.
 *
 * See {@link configure}'s implementation for supported REST APIs.
 */
@injectable()
export class SampleMockOpenVsxServer implements BackendApplicationContribution {

    @inject(SampleAppInfo)
    protected appInfo: SampleAppInfo;

    @inject(ILogger) @named('api-samples')
    protected readonly logger: ILogger;

    protected mockClient: OVSXMockClient;
    protected staticFileHandlers: Map<string, express.RequestHandler<{
        namespace: string;
        name: string;
        version: string;
    }, express.Response>>;

    private readyDeferred = new Deferred<void>();
    private ready = this.readyDeferred.promise;

    get mockServerPath(): string {
        return '/mock-open-vsx';
    }

    get pluginsDbPath(): string {
        return '../../sample-plugins';
    }

    async onStart?(server: http.Server | https.Server): Promise<void> {
        const selfOrigin = await this.appInfo.getSelfOrigin();
        const baseUrl = `${selfOrigin}${this.mockServerPath}`;
        const pluginsDb = await this.findMockPlugins(this.pluginsDbPath, baseUrl);
        this.staticFileHandlers = new Map(Array.from(pluginsDb.entries(), ([key, value]) => [key, express.static(value.path)]));
        this.mockClient = new OVSXMockClient(Array.from(pluginsDb.values(), value => value.data));
        this.readyDeferred.resolve();
    }

    async configure(app: express.Application): Promise<void> {
        app.use(
            this.mockServerPath + '/api',
            express.Router()
                .get('/v2/-/query', async (req, res) => {
                    await this.ready;
                    res.json(await this.mockClient.query(this.sanitizeQuery(req.query)));
                })
                .get('/-/search', async (req, res) => {
                    await this.ready;
                    res.json(await this.mockClient.search(this.sanitizeQuery(req.query)));
                })
                .get('/:namespace', async (req, res) => {
                    await this.ready;
                    const extensions = this.mockClient.extensions
                        .filter(ext => req.params.namespace === ext.namespace)
                        .map(ext => `${ext.namespaceUrl}/${ext.name}`);
                    if (extensions.length === 0) {
                        res.status(404).json({ error: `Namespace not found: ${req.params.namespace}` });
                    } else {
                        res.json({
                            name: req.params.namespace,
                            extensions
                        });
                    }
                })
                .get('/:namespace/:name', async (req, res) => {
                    await this.ready;
                    res.json(this.mockClient.extensions.find(ext => req.params.namespace === ext.namespace && req.params.name === ext.name));
                })
                .get('/:namespace/:name/reviews', async (req, res) => {
                    res.json([]);
                })
                // implicitly GET/HEAD because of the express.static handlers
                .use('/:namespace/:name/:version/file', async (req, res, next) => {
                    await this.ready;
                    const versionedId = this.getVersionedId(req.params.namespace, req.params.name, req.params.version);
                    const staticFileHandler = this.staticFileHandlers.get(versionedId);
                    if (!staticFileHandler) {
                        return next();
                    }
                    staticFileHandler(req, res, next);
                })
        );
    }

    protected getVersionedId(namespace: string, name: string, version: string): VersionedId {
        return `${namespace}.${name}@${version}`;
    }

    protected sanitizeQuery(query?: Record<string, unknown>): Record<string, string> {
        return typeof query === 'object'
            ? Object.fromEntries(Object.entries(query).filter(([key, value]) => typeof value === 'string') as [string, string][])
            : {};
    }

    /**
     * This method expects the following folder hierarchy: `pluginsDbPath/namespace/pluginName/pluginFiles...`
     * @param pluginsDbPath where to look for plugins on the disk.
     * @param baseUrl used when generating the URLs for {@link VSXExtensionRaw} properties.
     */
    protected async findMockPlugins(pluginsDbPath: string, baseUrl: string): Promise<Map<VersionedId, { path: string, data: VSXExtensionRaw }>> {
        const url = new OVSXMockClient.UrlBuilder(baseUrl);
        const result = new Map<VersionedId, { path: string, data: VSXExtensionRaw }>();
        if (!await this.isDirectory(pluginsDbPath)) {
            this.logger.error(`ERROR: ${pluginsDbPath} is not a directory!`);
            return result;
        }
        const namespaces = await fs.promises.readdir(pluginsDbPath);
        await Promise.all(namespaces.map(async namespace => {
            const namespacePath = path.join(pluginsDbPath, namespace);
            if (!await this.isDirectory(namespacePath)) {
                return;
            }
            const names = await fs.promises.readdir(namespacePath);
            await Promise.all(names.map(async pluginName => {
                const pluginPath = path.join(namespacePath, pluginName);
                if (!await this.isDirectory(pluginPath)) {
                    return;
                }
                const packageJsonPath = path.join(pluginPath, 'package.json');
                const { name, version } = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8'));
                const versionedId = this.getVersionedId(namespace, name, version);
                result.set(versionedId, {
                    path: pluginPath,
                    data: {
                        allVersions: {},
                        downloadCount: 0,
                        files: {
                            // the default generated name from vsce is NAME-VERSION.vsix
                            download: url.extensionFileUrl(namespace, name, version, `/${name}-${version}.vsix`),
                            icon: url.extensionFileUrl(namespace, name, version, '/icon128.png'),
                            readme: url.extensionFileUrl(namespace, name, version, '/README.md')
                        },
                        name,
                        namespace,
                        namespaceAccess: 'public',
                        namespaceUrl: url.namespaceUrl(namespace),
                        publishedBy: {
                            loginName: 'mock-open-vsx'
                        },
                        reviewCount: 0,
                        reviewsUrl: url.extensionReviewsUrl(namespace, name),
                        timestamp: new Date().toISOString(),
                        version,
                        namespaceDisplayName: name,
                        preRelease: false
                    }
                });
            }));
        }));
        return result;
    }

    protected async isDirectory(fsPath: string): Promise<boolean> {
        return (await fs.promises.stat(fsPath)).isDirectory();
    }
}
