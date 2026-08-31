// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import URI from '../common/uri';
import { ContextKeyService, ContextKey } from './context-key-service';
import { LanguageService } from './language-service';

/**
 * The context key values describing a resource.
 */
export interface ResourceContextKeyValues {
    resource?: string;
    resourceScheme?: string;
    resourceFilename?: string;
    resourceExtname?: string;
    resourceLangId?: string;
    resourceDirName?: string;
    resourcePath?: string;
    resourceSet: boolean;
}

@injectable()
export class ResourceContextKey {

    @inject(LanguageService)
    protected readonly languages: LanguageService;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected resource: ContextKey<string>;
    protected resourceSchemeKey: ContextKey<string>;
    protected resourceFileName: ContextKey<string>;
    protected resourceExtname: ContextKey<string>;
    protected resourceLangId: ContextKey<string>;
    protected resourceDirName: ContextKey<string>;
    protected resourcePath: ContextKey<string>;
    protected resourceSet: ContextKey<boolean>;

    @postConstruct()
    protected init(): void {
        this.resource = this.contextKeyService.createKey<string>('resource', undefined);
        this.resourceSchemeKey = this.contextKeyService.createKey<string>('resourceScheme', undefined);
        this.resourceFileName = this.contextKeyService.createKey<string>('resourceFilename', undefined);
        this.resourceExtname = this.contextKeyService.createKey<string>('resourceExtname', undefined);
        this.resourceLangId = this.contextKeyService.createKey<string>('resourceLangId', undefined);
        this.resourceDirName = this.contextKeyService.createKey<string>('resourceDirName', undefined);
        this.resourcePath = this.contextKeyService.createKey<string>('resourcePath', undefined);
        this.resourceSet = this.contextKeyService.createKey<boolean>('resourceSet', false);
    }

    get(): string | undefined {
        return this.resource.get();
    }

    set(resourceUri: URI | undefined): void {
        const values = this.toValues(resourceUri);
        this.resource.set(values.resource);
        this.resourceSchemeKey.set(values.resourceScheme);
        this.resourceFileName.set(values.resourceFilename);
        this.resourceExtname.set(values.resourceExtname);
        this.resourceLangId.set(values.resourceLangId);
        this.resourceDirName.set(values.resourceDirName);
        this.resourcePath.set(values.resourcePath);
        this.resourceSet.set(values.resourceSet);
    }

    /**
     * The values describing `resourceUri`, without applying them to the context.
     *
     * @param resourceUri the resource to describe, or `undefined` to obtain the values of an unset resource.
     */
    toValues(resourceUri: URI | undefined): ResourceContextKeyValues {
        return {
            resource: resourceUri?.toString(),
            resourceScheme: resourceUri?.scheme,
            resourceFilename: resourceUri?.path.base,
            resourceExtname: resourceUri?.path.ext,
            resourceLangId: resourceUri && this.getLanguageId(resourceUri),
            resourceDirName: resourceUri?.path.dir.fsPath(),
            resourcePath: resourceUri?.path.fsPath(),
            resourceSet: Boolean(resourceUri)
        };
    }

    protected getLanguageId(uri: URI | undefined): string | undefined {
        if (uri) {
            for (const language of this.languages.languages) {
                if (language.extensions.has(uri.path.ext)) {
                    return language.id;
                }
            }
        }
        return undefined;
    }
}
