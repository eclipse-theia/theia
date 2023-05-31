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
        this.resource.set(resourceUri?.toString());
        this.resourceSchemeKey.set(resourceUri?.scheme);
        this.resourceFileName.set(resourceUri?.path.base);
        this.resourceExtname.set(resourceUri?.path.ext);
        this.resourceLangId.set(resourceUri && this.getLanguageId(resourceUri));
        this.resourceDirName.set(resourceUri?.path.dir.fsPath());
        this.resourcePath.set(resourceUri?.path.fsPath());
        this.resourceSet.set(Boolean(resourceUri));
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
