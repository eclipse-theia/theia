/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { LabelProviderContribution } from "@theia/core/lib/browser/label-provider";
import URI from '@theia/core/lib/common/uri';
import { JAVA_SCHEME } from '../common/index';
import { MaybePromise } from '@theia/core/lib/common';
import { injectable } from 'inversify';

@injectable()
export class JavaLabelProviderContribution implements LabelProviderContribution {

    canHandle(element: object): number {
        if (element instanceof URI && element.scheme === JAVA_SCHEME) {
            return 30;
        } else {
            return -1;
        }
    }

    /**
     * returns an icon class for the given element.
     */
    getIcon(element: URI): MaybePromise<string> {
        return 'java-icon';
    }

    /**
     * returns a short name for the given element.
     */
    getName(element: URI): string {
        return element.displayName;
    }

    /**
     * returns a long name for the given element.
     */
    getLongName(element: URI): string {
        return element.path.toString();
    }
}
