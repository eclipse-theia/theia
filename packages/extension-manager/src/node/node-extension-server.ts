/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as showdown from 'showdown';
import * as sanitize from 'sanitize-html';
import { injectable, inject } from 'inversify';
import { DisposableCollection } from '@theia/core';
import { PublishedNodePackage, ExtensionPackage } from '@theia/application-package';
import {
    RawExtension, ResolvedRawExtension, ResolvedExtension, Extension, ExtensionServer, ExtensionClient, SearchParam, ExtensionChange
} from '../common/extension-protocol';
import * as npms from './npms';
import { ApplicationProject } from './application-project';

export type ExtensionKeywords = string[];
export const ExtensionKeywords = Symbol('ExtensionKeyword');

@injectable()
export class NodeExtensionServer implements ExtensionServer {

    protected client: ExtensionClient | undefined;
    protected readonly toDispose = new DisposableCollection();

    protected readonly busyExtensions = new Set<string>();

    constructor(
        @inject(ApplicationProject) protected readonly project: ApplicationProject,
        @inject(ExtensionKeywords) protected readonly extensionKeywords: ExtensionKeywords
    ) {
        this.toDispose.push(project.onWillInstall(param => this.notification('onWillStartInstallation')(param)));
        this.toDispose.push(project.onDidInstall(result => this.notification('onDidStopInstallation')(result)));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    setClient(client: ExtensionClient | undefined): void {
        this.client = client;
    }

    protected notification<T extends keyof ExtensionClient>(notification: T): ExtensionClient[T] {
        return this.client ? this.client[notification] : () => { };
    }

    async search(param: SearchParam): Promise<RawExtension[]> {
        const manager = this.project.createPackageManager();
        const query = this.prepareQuery(param.query);
        const packages = await npms.search(query, param.from, param.size);
        const extensions = [];
        for (const raw of packages) {
            if (PublishedNodePackage.is(raw)) {
                const extensionPackage = await manager.pck.findExtensionPackage(raw.name);
                if (extensionPackage) {
                    const extension = this.toRawExtension(extensionPackage);
                    extensions.push(extension);
                }
            }
        }
        return extensions;
    }
    protected prepareQuery(query: string): string {
        const args = query.split(/\s+/).map(v => v.toLowerCase().trim()).filter(v => !!v);
        return [`keywords:${this.extensionKeywords.join(',')}`, ...args].join(' ');
    }

    async resolveRaw(extension: string): Promise<ResolvedRawExtension> {
        const manager = this.project.createPackageManager();
        const extensionPackage = await manager.pck.findExtensionPackage(extension);
        if (!extensionPackage) {
            throw new Error('The extension package is not found for ' + extension);
        }
        return this.toResolvedRawExtension(extensionPackage);
    }

    async installed(): Promise<RawExtension[]> {
        const manager = this.project.createPackageManager();
        return manager.pck.extensionPackages.map(pck => this.toRawExtension(pck));
    }

    async install(extension: string): Promise<void> {
        this.setBusy(extension, true);
        try {
            const manager = this.project.createPackageManager();
            const extensionPackage = await manager.pck.findExtensionPackage(extension);
            if (!extensionPackage) {
                return;
            }
            const latestVersion = await extensionPackage.getLatestVersion();
            if (!latestVersion) {
                return;
            }
            if (manager.pck.setDependency(extension, `^${latestVersion}`)) {
                this.notifyDidChange({
                    name: extension,
                    installed: true
                });
                await manager.pck.save();
            }
        } finally {
            this.setBusy(extension, false);
        }
    }

    async uninstall(extension: string): Promise<void> {
        this.setBusy(extension, true);
        try {
            const manager = this.project.createPackageManager();
            if (manager.pck.setDependency(extension, undefined)) {
                this.notifyDidChange({
                    name: extension,
                    installed: false,
                    outdated: false
                });
                await manager.pck.save();
            }
        } finally {
            this.setBusy(extension, false);
        }
    }

    async outdated(): Promise<RawExtension[]> {
        const result: RawExtension[] = [];
        const promises = [];
        const manager = this.project.createPackageManager();
        for (const extensionPackage of manager.pck.extensionPackages) {
            promises.push(extensionPackage.isOutdated().then(outdated => {
                if (outdated) {
                    result.push(this.toRawExtension(extensionPackage));
                }
            }));
        }
        await Promise.all(promises);
        return result;
    }

    async update(extension: string): Promise<void> {
        this.setBusy(extension, true);
        try {
            const manager = this.project.createPackageManager();
            const extensionPackage = manager.pck.getExtensionPackage(extension);
            if (!extensionPackage || !extensionPackage.version) {
                return;
            }
            if (!await extensionPackage.isOutdated()) {
                return;
            }
            const latestVersion = await extensionPackage.getLatestVersion();
            if (!latestVersion) {
                return;
            }
            if (manager.pck.setDependency(extension, `^${latestVersion}`)) {
                this.notifyDidChange({
                    name: extension,
                    outdated: false
                });
                await manager.pck.save();
            }
        } finally {
            this.setBusy(extension, false);
        }
    }

    async list(param?: SearchParam): Promise<Extension[]> {
        const manager = this.project.createPackageManager();
        if (param && param.query) {
            const found = await this.search(param);
            return Promise.all(found.map(raw => {
                const extensionPackage = manager.pck.getExtensionPackage(raw.name);
                if (extensionPackage) {
                    return this.toExtension(extensionPackage);
                }
                return Object.assign(raw, {
                    busy: this.isBusy(raw.name),
                    installed: false,
                    outdated: false
                });
            }));
        }
        return Promise.all(manager.pck.extensionPackages.map(pck => this.toExtension(pck)));
    }

    async resolve(extension: string): Promise<ResolvedExtension> {
        const manager = await this.project.createPackageManager();
        const extensionPackage = await manager.pck.findExtensionPackage(extension);
        if (!extensionPackage) {
            throw new Error('The extension package is not found for ' + extension);
        }
        return this.toResolvedExtension(extensionPackage);
    }

    protected async toResolvedExtension(extensionPackage: ExtensionPackage): Promise<ResolvedExtension> {
        const resolvedRawExtension = await this.toResolvedRawExtension(extensionPackage);
        return this.withExtensionPackage(resolvedRawExtension, extensionPackage);
    }

    protected async toResolvedRawExtension(extensionPackage: ExtensionPackage): Promise<ResolvedRawExtension> {
        const rawExtension = this.toRawExtension(extensionPackage);
        const documentation = await this.compileDocumentation(extensionPackage);
        return Object.assign(rawExtension, {
            documentation
        });
    }

    protected async compileDocumentation(extensionPackage: ExtensionPackage): Promise<string> {
        const markdownConverter = new showdown.Converter({
            noHeaderId: true,
            strikethrough: true,
            headerLevelStart: 2
        });
        const readme = await extensionPackage.getReadme();
        const readmeHtml = markdownConverter.makeHtml(readme);
        return sanitize(readmeHtml, {
            allowedTags: sanitize.defaults.allowedTags.concat(['h1', 'h2', 'img'])
        });
    }

    protected async toExtension(extensionPackage: ExtensionPackage): Promise<Extension> {
        const rawExtension = this.toRawExtension(extensionPackage);
        return this.withExtensionPackage(rawExtension, extensionPackage);
    }

    protected async withExtensionPackage<T extends RawExtension>(raw: T, extensionPackage: ExtensionPackage): Promise<T & Extension> {
        return Object.assign(raw, {
            installed: extensionPackage.installed,
            outdated: await extensionPackage.isOutdated(),
            busy: this.isBusy(extensionPackage.name),
            dependent: extensionPackage.dependent
        });
    }

    protected toRawExtension(extensionPackage: ExtensionPackage): RawExtension {
        return {
            name: extensionPackage.name,
            version: extensionPackage.version,
            description: extensionPackage.description,
            author: extensionPackage.getAuthor()
        };
    }

    protected isBusy(extension: string): boolean {
        return this.busyExtensions.has(extension);
    }

    protected setBusy(extension: string, busy: boolean): void {
        if (busy) {
            this.busyExtensions.add(extension);
        } else {
            this.busyExtensions.delete(extension);
        }
        this.notifyDidChange({
            name: extension,
            busy
        });
    }

    protected notifyDidChange(change: ExtensionChange): void {
        this.notification('onDidChange')(change);
    }

    scheduleInstall(): Promise<void> {
        return this.project.scheduleInstall();
    }

}
