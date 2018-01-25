/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import URI from '../common/uri';
import { OpenHandler } from './opener-service';

@injectable()
export class HttpOpenHandler implements OpenHandler {

    readonly id = 'http';

    canHandle(uri: URI): number {
        return uri.scheme.startsWith('http') ? 500 : 0;
    }

    open(uri: URI): Window | undefined {
        return window.open(uri.toString()) || undefined;
    }

}
