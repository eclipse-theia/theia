// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { MaybePromise } from '@theia/core/lib/common/types';
import {
    LocationMapperService,
    LocationWithoutSchemeMapper,
} from '@theia/mini-browser/lib/browser/location-mapper-service';
import { normalizeMiniBrowserOpenUrl } from '@theia/mini-browser/lib/browser/mini-browser-url-utils';

@injectable()
export class QaapLocationMapperService extends LocationMapperService {

    override async map(location: string): Promise<string> {
        const normalized = normalizeMiniBrowserOpenUrl(location);
        if (!normalized) {
            throw new Error('Empty URL');
        }
        const contributions = await this.prioritize(normalized);
        if (contributions.length === 0) {
            return this.defaultMapper()(normalized);
        }
        return contributions[0].map(normalized);
    }
}

@injectable()
export class QaapLocationWithoutSchemeMapper extends LocationWithoutSchemeMapper {

    override canHandle(location: string): MaybePromise<number> {
        try {
            return new URI(location).scheme === '' ? 1 : 0;
        } catch {
            return 0;
        }
    }
}
