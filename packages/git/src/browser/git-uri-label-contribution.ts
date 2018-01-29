/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { LabelProviderContribution, LabelProvider } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { MaybePromise } from '@theia/core';

@injectable()
export class GitUriLabelProviderContribution implements LabelProviderContribution {

    constructor( @inject(LabelProvider) protected labelProvider: LabelProvider) {
    }

    canHandle(element: object): number {
        if (element instanceof URI && element.scheme === GIT_RESOURCE_SCHEME) {
            return 20;
        }
        return 0;
    }

    getLongName(uri: URI): string {
        return this.labelProvider.getLongName(this.toFileUri(uri).withoutQuery().withoutFragment());
    }

    getName(uri: URI): string {
        return this.labelProvider.getName(this.toFileUri(uri)) + this.getTagSuffix(uri);
    }

    getIcon(uri: URI): MaybePromise<string> {
        return this.labelProvider.getIcon(this.toFileUri(uri));
    }

    protected toFileUri(uri: URI) {
        return uri.withScheme('file');
    }

    protected getTagSuffix(uri: URI) {
        if (uri.query) {
            return ` (${uri.query})`;
        } else {
            return "";
        }
    }
}
