/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs-extra';
import * as paths from 'path';
import * as semver from 'semver';
import { NpmRegistry, PublishedNodePackage, NodePackage } from './npm-registry';

export interface Extension {
    frontend?: string;
    frontendElectron?: string;
    backend?: string;
    backendElectron?: string;
}

export class ExtensionPackage {
    constructor(
        protected readonly raw: PublishedNodePackage & Partial<RawExtensionPackage>,
        protected readonly registry: NpmRegistry
    ) {
        this.raw = raw;
    }

    get name(): string {
        return this.raw.name;
    }

    get version(): string {
        if (this.raw.installed) {
            return this.raw.installed.version;
        }
        return this.raw.version;
    }

    get description(): string {
        return this.raw.description || '';
    }

    get theiaExtensions(): Extension[] {
        return this.raw.theiaExtensions || [];
    }

    get installed(): boolean {
        return !!this.raw.installed;
    }

    readme?: string;
    async getReadme(): Promise<string> {
        if (this.readme === undefined) {
            this.readme = await this.resolveReadme();
        }
        return this.readme;
    }
    protected async resolveReadme(): Promise<string> {
        if (this.raw.installed) {
            const readmePath = paths.resolve(this.raw.installed.packagePath, '..', 'README.md');
            if (await fs.pathExists(readmePath)) {
                return fs.readFile(readmePath, { encoding: 'utf8' });
            }
            return '';
        }
        const raw = await RawExtensionPackage.view(this.registry, this.name, this.version);
        return raw ? raw.readme || '' : '';
    }

    latestVersion?: string;
    async getLatestVersion(): Promise<string | undefined> {
        if (this.latestVersion === undefined) {
            this.latestVersion = await this.resolveLatestVersion();
        }
        return this.latestVersion;
    }
    protected resolveLatestVersion(): Promise<string | undefined> {
        return this.registry.latestVersion(this.name);
    }

    getAuthor(): string {
        if (this.raw.publisher) {
            return this.raw.publisher.username;
        }
        if (typeof this.raw.author === 'string') {
            return this.raw.author;
        }
        if (this.raw.author && this.raw.author.name) {
            return this.raw.author.name;
        }
        if (!!this.raw.maintainers && this.raw.maintainers.length > 0) {
            return this.raw.maintainers[0].username;
        }
        return '';
    }

    async isOutdated(): Promise<boolean> {
        if (!this.raw.installed) {
            return false;
        }
        const latestVersion = await this.getLatestVersion();
        if (!latestVersion) {
            return false;
        }
        if (semver.gtr(latestVersion, this.raw.version)) {
            return true;
        }
        return semver.gt(latestVersion, this.raw.installed.version);
    }
}

export interface RawExtensionPackage extends PublishedNodePackage {
    installed?: {
        version: string;
        packagePath: string;
    }
    theiaExtensions: Extension[];
}
export namespace RawExtensionPackage {
    export function is(pck: NodePackage | undefined): pck is RawExtensionPackage {
        return PublishedNodePackage.is(pck) && !!pck.theiaExtensions;
    }
    export async function view(registry: NpmRegistry, name: string, version?: string): Promise<RawExtensionPackage | undefined> {
        const result = await registry.view({ name, abbreviated: false }).catch(() => undefined);
        if (!result) {
            return undefined;
        }
        const latest = result['dist-tags']['latest'];
        const current = !version ? latest : result['dist-tags'][version] || version;
        const raw = result.versions[current];
        if (!is(raw)) {
            return undefined;
        }
        raw.readme = result.readme;
        raw.latestVersion = latest;
        return raw;
    }
}
