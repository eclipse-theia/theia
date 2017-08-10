/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as showdown from 'showdown';
import * as sanitize from 'sanitize-html';
import { injectable, inject } from 'inversify';
import { ExtensionPackage } from 'generator-theia';
import * as npm from 'generator-theia/generators/common/npm';
import { DisposableCollection } from '@theia/core';
import {
    RawExtension, ResolvedRawExtension, ResolvedExtension, Extension, ExtensionServer, ExtensionClient, SearchParam
} from '../common/extension-protocol';
import * as npms from './npms';
import { AppProject } from './app-project';

export interface InstallationState {
    readonly installed: RawExtension[];
    readonly outdated: RawExtension[];
}

@injectable()
export class NodeExtensionServer implements ExtensionServer {

    protected client: ExtensionClient | undefined;
    protected readonly toDispose = new DisposableCollection();

    protected readonly busyExtensions = new Set<string>();

    constructor( @inject(AppProject) protected readonly appProject: AppProject) {
        this.toDispose.push(appProject.onDidChangePackage(() =>
            this.notification('onDidChange')()
        ));
        this.toDispose.push(appProject.onWillInstall(() =>
            this.notification('onWillStartInstallation')()
        ));
        this.toDispose.push(appProject.onDidInstall(params =>
            this.notification('onDidStopInstallation')(params)
        ));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    setClient(client: ExtensionClient | undefined): void {
        this.client = client;
    }

    protected notification<T extends keyof ExtensionClient>(notification: T): ExtensionClient[T] {
        if (this.client) {
            return this.client[notification];
        }
        return () => {
        };
    }

    async search(param: SearchParam): Promise<RawExtension[]> {
        const projectModel = await this.appProject.load();
        const extensionKeywords = projectModel.config.extensionKeywords;
        const query = this.prepareQuery(param.query, extensionKeywords);
        const packages = await npms.search(query, param.from, param.size);
        const extensions = [];
        for (const raw of packages) {
            if (ExtensionPackage.is(raw, extensionKeywords)) {
                const extensionPackage = new ExtensionPackage(raw);
                const extension = this.toRawExtension(extensionPackage);
                extensions.push(extension);
            }
        }
        return extensions;
    }

    protected prepareQuery(query: string, extensionKeywords: string[]): string {
        const args = query.split(/\s+/).map(v => v.toLowerCase().trim()).filter(v => !!v);
        return [`keywords:'${extensionKeywords.join(',')}'`, ...args].join(' ');
    }

    async resolveRaw(extension: string): Promise<ResolvedRawExtension> {
        const projectModel = await this.appProject.load();
        const extensionPackage = await projectModel.findExtensionPackage(extension);
        if (!extensionPackage) {
            throw new Error('The extension package is not found for ' + extension);
        }
        return this.toResolvedRawExtension(extensionPackage);
    }

    /**
     * Extension packages listed in `theia.package.json` are installed.
     */
    async installed(): Promise<RawExtension[]> {
        const projectModel = await this.appProject.load();
        return projectModel.extensionPackages.map(pck => this.toRawExtension(pck));
    }

    async install(extension: string): Promise<void> {
        this.setBusy(extension, true);
        const latestVersion = await this.latestVersion(extension);
        if (latestVersion) {
            await this.appProject.update(model =>
                model.setDependency(extension, latestVersion)
            );
        }
        this.setBusy(extension, false);
    }

    async uninstall(extension: string): Promise<void> {
        this.setBusy(extension, true);
        await this.appProject.update(model =>
            model.setDependency(extension, undefined)
        );
        this.setBusy(extension, false);
    }

    /**
     * Extension packages listed in `theia.package.json`
     * with versions less than the latest published are outdated.
     */
    async outdated(): Promise<RawExtension[]> {
        const projectModel = await this.appProject.load();
        return projectModel.extensionPackages.filter(pck =>
            pck.isOutdated()
        ).map(pck => this.toRawExtension(pck));
    }

    async update(extension: string): Promise<void> {
        this.setBusy(extension, true);
        await this.appProject.update(async model => {
            const extensionPackage = model.getExtensionPackage(extension);
            if (!extensionPackage || !extensionPackage.version) {
                return false;
            }
            if (!extensionPackage.isOutdated()) {
                return false;
            }
            return model.setDependency(extension, extensionPackage.latestVersion);
        });
        this.setBusy(extension, false);

    }

    async list(param?: SearchParam): Promise<Extension[]> {
        const projectModel = await this.appProject.load();

        if (param && param.query) {
        const found = await this.search(param);
        return found.map(raw => {
        const extensionPackage = projectModel.getExtensionPackage(raw.name );
        if (extensionPackage) {
            return this.toExtension( extensionPackage);
            }
                return Object.assign(raw, {
            busy: this.isBusy(raw.name),
            installed : false,
            outdated : false
            });
            });
        }
        return projectModel.extensionPackages.map(pck => this.toExtension(pck));
    }

    async resolve(extension: string): Promise<ResolvedExtension> {
        const projectModel = await this.appProject.load();
        const extensionPackage = await projectModel.findExtensionPackage(extension);
        if (!extensionPackage) {
            throw new Error('The extension package is not found for ' + extension);
        }
        return this.toResolvedExtension(extensionPackage);
    }

    protected toResolvedExtension(extensionPackage: ExtensionPackage): ResolvedExtension {
        const resolvedRawExtension = this.toResolvedRawExtension(extensionPackage);
        return Object.assign(resolvedRawExtension, {
            installed: extensionPackage.installed,
            outdated: extensionPackage.isOutdated(),
            busy: this.isBusy(extensionPackage.name)
        });
    }

    protected toResolvedRawExtension(extensionPackage: ExtensionPackage): ResolvedRawExtension {
        const rawExtension = this.toRawExtension(extensionPackage);
        const documentation = this.compileDocumentation(extensionPackage);
        return Object.assign(rawExtension, {
            documentation
        });
    }

    protected compileDocumentation(extensionPackage: ExtensionPackage): string {
        const markdownConverter = new showdown.Converter({
            noHeaderId: true,
            strikethrough: true
        });
        const readme = extensionPackage.getReadme();
        const readmeHtml = markdownConverter.makeHtml(readme);
        return sanitize(readmeHtml, {
            allowedTags: sanitize.defaults.allowedTags.concat(['h1', 'h2', 'img'])
        });
    }

    protected toExtension(extensionPackage: ExtensionPackage): Extension {    const rawExtension = this.toRawExtension(extensionPackage);
                return Object.assign(rawExtension,{
                installed: extensionPackage.installed,
                outdated: extensionPackage.isOutdated(),
            busy: this.isBusy(extensionPackage.name)
        });
    }

    protected toRawExtension(extensionPackage: ExtensionPackage): RawExtension {
        return {
                name: extensionPackage.name,
                version: extensionPackage.version || '',
                description: extensionPackage.description || '',
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
        this.notification('onDidChange')();
    }

    protected latestVersion(extension: string): Promise<string | undefined> {
        return npm.version(extension).catch(() => undefined);
    }

    needInstall(): Promise<boolean> {
        return this.appProject.needInstall();
    }

    scheduleInstall(): Promise<void> {
        return this.appProject.scheduleInstall({
            force: true
        });
    }

}
