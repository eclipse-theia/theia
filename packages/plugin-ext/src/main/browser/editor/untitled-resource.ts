// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { injectable } from '@theia/core/shared/inversify';
import { Resource, ResourceResolver, ResourceVersion } from '@theia/core/lib/common/resource';
import URI from '@theia/core/lib/common/uri';
import { Schemes } from '../../../common/uri-components';

let index = 0;

@injectable()
export class UntitledResourceResolver implements ResourceResolver {

    protected readonly resources = new Map<string, UntitledResource>();

    async resolve(uri: URI): Promise<UntitledResource> {
        if (uri.scheme !== Schemes.untitled) {
            throw new Error('The given uri is not untitled file uri: ' + uri);
        } else {
            const untitledResource = this.resources.get(uri.toString());
            if (!untitledResource) {
                return this.createUntitledResource('', '', uri);
            } else {
                return untitledResource;
            }
        }
    }

    async createUntitledResource(content?: string, language?: string, uri?: URI): Promise<UntitledResource> {
        let extension;
        if (language) {
            for (const lang of monaco.languages.getLanguages()) {
                if (lang.id === language) {
                    if (lang.extensions) {
                        extension = lang.extensions[0];
                        break;
                    }
                }
            }
        }
        return new UntitledResource(this.resources, uri ? uri : new URI().withScheme(Schemes.untitled).withPath(`/Untitled-${index++}${extension ? extension : ''}`),
            content);
    }
}

export class UntitledResource implements Resource {

    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    readonly onDidChangeContents: Event<void> = this.onDidChangeContentsEmitter.event;

    constructor(private resources: Map<string, UntitledResource>, public uri: URI, private content?: string) {
        this.resources.set(this.uri.toString(), this);
    }

    dispose(): void {
        this.resources.delete(this.uri.toString());
        this.onDidChangeContentsEmitter.dispose();
    }

    async readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        if (this.content) {
            return this.content;
        } else {
            return '';
        }
    }

    async saveContents(content: string, options?: { encoding?: string, overwriteEncoding?: boolean }): Promise<void> {
        // This function must exist to ensure readOnly is false for the Monaco editor.
        // However it should not be called because saving 'untitled' is always processed as 'Save As'.
        throw Error('never');
    }

    protected fireDidChangeContents(): void {
        this.onDidChangeContentsEmitter.fire(undefined);
    }

    get version(): ResourceVersion | undefined {
        return undefined;
    }

    get encoding(): string | undefined {
        return undefined;
    }
}

export function createUntitledURI(language?: string): URI {
    let extension;
    if (language) {
        for (const lang of monaco.languages.getLanguages()) {
            if (lang.id === language) {
                if (lang.extensions) {
                    extension = lang.extensions[0];
                    break;
                }
            }
        }
    }
    return new URI().withScheme(Schemes.untitled).withPath(`/Untitled-${index++}${extension ? extension : ''}`);
}
