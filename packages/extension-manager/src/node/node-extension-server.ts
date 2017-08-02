/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as semver from 'semver';
import { inject, injectable } from 'inversify';
import { CommonAppGenerator, generatorTheiaPath, ExtensionPackage, ProjectModel } from 'generator-theia';
import * as npm from 'generator-theia/generators/common/npm';

import {
    RawExtension, ResolvedRawExtension, Extension, ResolvedExtension, ExtensionServer, ExtensionClient, SearchParam
} from '../common/extension-protocol';
import * as npms from './npms';

export interface InstallationState {
    readonly installed: RawExtension[];
    readonly outdated: RawExtension[];
}

export const NodeExtensionServerOptions = Symbol('NodeExtensionServerOptions');
export interface NodeExtensionServerOptions {
    projectPath: string;
}

@injectable()
export class NodeExtensionServer implements ExtensionServer {

    constructor(
        @inject(NodeExtensionServerOptions) protected readonly options: NodeExtensionServerOptions
    ) { }

    dispose(): void {
        // no-op
    }

    setClient(client: ExtensionClient | undefined): void {
    }

    async search(param: SearchParam): Promise<RawExtension[]> {
        const model = await this.model;
        const extensionKeywords = model.config.extensionKeywords;
        const query = this.prepareQuery(param.query, extensionKeywords);
        const packages = await npms.search(query, param.from, param.size);
        const extensions = [];
        for (const pck of packages) {
            if (ExtensionPackage.is(pck, extensionKeywords)) {
                const extension = this.toRawExtension(pck);
                extensions.push(extension);
            }
        }
        return extensions;
    }
    protected prepareQuery(query: string, extensionKeywords: string[]): string {
        const args = query.split(/\s+/).map(v => v.toLowerCase().trim()).filter(v => !!v);
        return [`keywords:'${extensionKeywords.join(',')}'`, ...args].join(' ');
    }
    resolveRaw(extension: string): Promise<ResolvedRawExtension> {
        return new Promise(resolve => { });
    }

    /**
     * Extension packages listed in `theia.package.json` are installed.
     */
    async installed(): Promise<RawExtension[]> {
        const model = await this.model;
        const extensions = [];
        for (const pck of model.extensionPackages) {
            const extension = this.toRawExtension(pck);
            extensions.push(extension);
        }
        return extensions;
    }
    install(extension: string): Promise<void> {
        return new Promise(resolve => { });
    }
    uninstall(extension: string): Promise<void> {
        return new Promise(resolve => { });
    }

    /**
     * Extension packages listed in `theia.package.json`
     * with versions less than the latest published are outdated.
     */
    async outdated(): Promise<RawExtension[]> {
        const installed = await this.installed();
        const outdated = await Promise.all(
            installed.map(extension => this.isOutdated(extension.name, extension.version))
        );
        return installed.filter((_, index) => outdated[index]);
    }
    update(extension: string): Promise<void> {
        return new Promise(resolve => { });
    }

    protected async installationState(): Promise<InstallationState> {
        const [installed, outdated] = await Promise.all([this.installed(), this.outdated()]);
        return { installed, outdated };
    }
    protected toExtension(raw: RawExtension, installation: InstallationState): Extension {
        const outdated = installation.outdated.some(e => e.name === raw.name);
        const installed = outdated || installation.installed.some(e => e.name === raw.name);
        return Object.assign(raw, { installed, outdated });
    }

    async list(param?: SearchParam): Promise<Extension[]> {
        const installation = await this.installationState();
        const extensions = param ? await this.search(param) : installation.installed;
        return extensions.map(raw =>
            this.toExtension(raw, installation)
        );
    }

    resolve(extension: string): Promise<ResolvedExtension> {
        return new Promise(() => { });
    }

    protected async isOutdated(extension: string, version: string): Promise<boolean> {
        const latest = await npm.version(extension).catch(() => undefined);
        return !!latest && semver.gt(latest, version);
    }

    protected toRawExtension(pck: ExtensionPackage): RawExtension {
        return {
            name: pck.name,
            version: pck.version || '',
            description: pck.description || '',
            author: this.getAuthor(pck)
        };
    }

    protected getAuthor(pck: ExtensionPackage): string {
        if (pck.publisher) {
            return pck.publisher.username;
        }
        if (typeof pck.author === 'string') {
            return pck.author;
        }
        if (pck.author && pck.author.name) {
            return pck.author.name;
        }
        if (!!pck.maintainers && pck.maintainers.length > 0) {
            return pck.maintainers[0].username;
        }
        return '';
    }

    protected get model(): Promise<ProjectModel> {
        const generator = new CommonAppGenerator([], {
            env: {
                cwd: this.options.projectPath
            },
            resolved: generatorTheiaPath
        });
        generator.initializing();
        return generator.configuring().then(() => generator.model);
    }

    needInstall(): Promise<boolean> {
        return new Promise(resolve => { });
    }
    scheduleInstall(): Promise<void> {
        return new Promise(resolve => { });
    }

}
