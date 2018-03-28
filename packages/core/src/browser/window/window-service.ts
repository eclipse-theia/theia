/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';

/**
 * Service for opening new browser windows.
 */
export const WindowService = Symbol('WindowService');
export interface WindowService {

    /**
     * Opens a new window and loads the content from the given URL.
     */
    openNewWindow(url: string): void;

}

@injectable()
export class DefaultWindowService implements WindowService {

    openNewWindow(url: string): void {
        const newWindow = window.open(url);
        if (newWindow === null) {
            throw new Error('Cannot open a new window for URL: ' + url);
        }
    }

}
