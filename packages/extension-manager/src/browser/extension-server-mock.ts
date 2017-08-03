
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import {
    Extension,
    ExtensionClient,
    ExtensionServer,
    RawExtension,
    ResolvedRawExtension,
    SearchParam
} from '../common/extension-protocol';
import { injectable } from "inversify";

@injectable()
export class ExtensionServerMock implements ExtensionServer {
    search(param: SearchParam): Promise<RawExtension[]> {
        throw new Error("Method not implemented.")
    }

    resolveRaw(extension: string): Promise<ResolvedRawExtension> {
        throw new Error("Method not implemented.")
    }

    installed(): Promise<RawExtension[]> {
        throw new Error("Method not implemented.")
    }

    install(extension: string): Promise<void> {
        throw new Error("Method not implemented.")
    }

    uninstall(extension: string): Promise<void> {
        throw new Error("Method not implemented.")
    }

    outdated(): Promise<RawExtension[]> {
        throw new Error("Method not implemented.")
    }

    update(extension: string): Promise<void> {
        throw new Error("Method not implemented.")
    }

    list(param?: SearchParam): Promise<Extension[]> {
        const extensions: Extension[] = []
        extensions.push(
            {
                installed: false,
                name: 'testExtension',
                outdated: false,
                author: 'jbi',
                description: 'A test for fun!',
                version: '0.0.1'
            },
            {
                installed: true,
                name: 'testExtension2',
                outdated: false,
                author: 'jbi',
                description: 'Another test for fun!',
                version: '0.0.1'
            },
            {
                installed: true,
                name: 'testExtension3',
                outdated: true,
                author: 'jbi',
                description: 'A third test for fun!',
                version: '0.0.1'
            }
        )
        return new Promise(
            function (resolve, reject) {
                resolve(extensions)
            }
        )
    }

    resolve(extension: string): Promise<Extension & ResolvedRawExtension> {
        console.log("RESOLVE");
        return new Promise(function (resolve, reject) {

            resolve();
        });
    }

    dispose(): void {
        throw new Error("Method not implemented.")
    }

    setClient(client: ExtensionClient | undefined): void {
        console.log('Method not implemented.')
    }

    needInstall(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
    scheduleInstall(): Promise<void> {
        throw new Error("Method not implemented.");
    }

}