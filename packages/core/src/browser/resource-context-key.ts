/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import URI from '../common/uri';
import { URI as Uri } from 'vscode-uri';
import { ContextKeyService, ContextKey } from './context-key-service';
import { LanguageService } from './language-service';

@injectable()
export class ResourceContextKey {

    @inject(LanguageService)
    protected readonly languages: LanguageService;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected resource: ContextKey<Uri>;
    protected resourceSchemeKey: ContextKey<string>;
    protected resourceFileName: ContextKey<string>;
    protected resourceExtname: ContextKey<string>;
    protected resourceLangId: ContextKey<string>;
    protected resourceDirName: ContextKey<string>;
    protected resourcePath: ContextKey<string>;

    @postConstruct()
    protected init(): void {
        this.resource = this.contextKeyService.createKey<Uri>('resource', undefined);
        this.resourceSchemeKey = this.contextKeyService.createKey<string>('resourceScheme', undefined);
        this.resourceFileName = this.contextKeyService.createKey<string>('resourceFilename', undefined);
        this.resourceExtname = this.contextKeyService.createKey<string>('resourceExtname', undefined);
        this.resourceLangId = this.contextKeyService.createKey<string>('resourceLangId', undefined);
        this.resourceDirName = this.contextKeyService.createKey<string>('resourceDirName', undefined);
        this.resourcePath = this.contextKeyService.createKey<string>('resourcePath', undefined);
    }

    get(): URI | undefined {
        const codeUri = this.resource.get();
        return codeUri && new URI(codeUri);
    }

    set(resourceUri: URI | undefined): void {
        this.resource.set(resourceUri && resourceUri['codeUri']);
        this.resourceSchemeKey.set(resourceUri && resourceUri.scheme);
        this.resourceFileName.set(resourceUri && resourceUri.path.base);
        this.resourceExtname.set(resourceUri && resourceUri.path.ext);
        this.resourceLangId.set(resourceUri && this.getLanguageId(resourceUri));
        this.resourceDirName.set(resourceUri && Uri.parse(resourceUri.path.dir.toString()).fsPath);
        this.resourcePath.set(resourceUri && resourceUri['codeUri'].fsPath);
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
