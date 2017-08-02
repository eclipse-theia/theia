/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import {
    ExtensionClient,
    ExtensionIdentifier,
    ExtensionServer,
    RawExtension,
    ResolvedRawExtension,
} from '../common/extension-protocol';
import { Extension } from '../common';
import { injectable } from "inversify";

@injectable()
export class ExtensionServerMock implements ExtensionServer {
    find(query: string): Promise<RawExtension[]> {
        throw new Error("Method not implemented.");
    }
    resolveRaw(extension: ExtensionIdentifier): Promise<ResolvedRawExtension> {
        throw new Error("Method not implemented.");
    }
    installed(): Promise<RawExtension[]> {
        throw new Error("Method not implemented.");
    }
    install(extension: ExtensionIdentifier): void {
        throw new Error("Method not implemented.");
    }
    uninstall(extension: ExtensionIdentifier): void {
        throw new Error("Method not implemented.");
    }
    outdated(): Promise<RawExtension[]> {
        throw new Error("Method not implemented.");
    }
    update(extension: ExtensionIdentifier): void {
        throw new Error("Method not implemented.");
    }
    list(query?: string | undefined): Promise<Extension[]> {
        const extensions: Extension[] = [];
        extensions.push(new Extension({
            installed: false,
            name: 'testExtension',
            outdated: false,
            author: 'jbi',
            description: 'A test for fun!',
            version: '0.0.1'
        }, this));
        return new Promise(
            function (resolve, reject) {
                resolve(extensions);
            }
        );
    }
    resolve(extension: ExtensionIdentifier): Promise<Extension & ResolvedRawExtension> {
        throw new Error("Method not implemented.");
    }
    dispose(): void {
        throw new Error("Method not implemented.");
    }
    setClient(client: ExtensionClient | undefined): void {
        console.log('Method not implemented.');
    }

}