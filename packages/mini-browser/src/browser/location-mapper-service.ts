/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Endpoint } from '@theia/core/lib/browser';
import { MaybePromise, Prioritizeable } from '@theia/core/lib/common/types';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';

/**
 * Contribution for the `LocationMapperService`.
 */
export const LocationMapper = Symbol('LocationMapper');
export interface LocationMapper {

    /**
     * Should return with a positive number if the current contribution can handle the given location.
     * The number indicates the priority of the location mapper. If it is not a positive number, it means, the
     * contribution cannot handle the location.
     */
    canHandle(location: string): MaybePromise<number>;

    /**
     * Maps the given location.
     */
    map(location: string): MaybePromise<string>;

}

/**
 * Location mapper service.
 */
@injectable()
export class LocationMapperService {

    @inject(ContributionProvider)
    @named(LocationMapper)
    protected readonly contributions: ContributionProvider<LocationMapper>;

    async map(location: string): Promise<string> {
        const contributions = await this.prioritize(location);
        if (contributions.length === 0) {
            return this.defaultMapper()(location);
        }
        return contributions[0].map(location);
    }

    protected defaultMapper(): (location: string) => MaybePromise<string> {
        return location => `http://${location}`;
    }

    protected async prioritize(location: string): Promise<LocationMapper[]> {
        const prioritized = await Prioritizeable.prioritizeAll(this.getContributions(), contribution => contribution.canHandle(location));
        return prioritized.map(p => p.value);
    }

    protected getContributions(): LocationMapper[] {
        return this.contributions.getContributions();
    }

}

/**
 * HTTP location mapper.
 */
@injectable()
export class HttpLocationMapper implements LocationMapper {

    canHandle(location: string): MaybePromise<number> {
        return location.startsWith('http://') ? 1 : 0;
    }

    map(location: string): MaybePromise<string> {
        return location;
    }

}

/**
 * HTTPS location mapper.
 */
@injectable()
export class HttpsLocationMapper implements LocationMapper {

    canHandle(location: string): MaybePromise<number> {
        return location.startsWith('https://') ? 1 : 0;
    }

    map(location: string): MaybePromise<string> {
        return location;
    }

}

/**
 * `file` URI location mapper.
 */
@injectable()
export class FileLocationMapper implements LocationMapper {

    canHandle(location: string): MaybePromise<number> {
        return location.startsWith('file://') ? 1 : 0;
    }

    map(location: string): MaybePromise<string> {
        return FileLocationMapper.toURL(new URI(location));
    }

}

export namespace FileLocationMapper {

    /**
     * Maps the `file` URI to an URL.
     */
    export function toURL(uri: URI, endpointPath: string = 'mini-browser'): MaybePromise<string> {
        if (uri.scheme !== 'file') {
            throw new Error(`Only URIs with 'file' scheme can be mapped to an URL. URI was: ${uri}.`);
        }
        let rawLocation = uri.withoutScheme().toString();
        if (rawLocation.charAt(0) === '/') {
            rawLocation = rawLocation.substr(1);
        }
        return new Endpoint().getRestUrl().resolve(`${endpointPath}/${rawLocation}`).toString();
    }

}
