/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';

/**
 * Helper for opening new browser windows and reloading the content of existing ones.
 */
export const WindowHelper = Symbol('WindowHelper');
export interface WindowHelper {

    /**
     * Reloads the content of the `window` argument.
     */
    reloadWindow(window: Window): void;

    /**
     * Opens a new window and loads the content from the given URL.
     */
    openNewWindow(url: string): void;

}

@injectable()
export class DefaultWindowHelper implements WindowHelper {

    reloadWindow(window: Window): void {
        window.location.reload();
    }

    openNewWindow(url: string): void {
        window.open(url);
    }

}
