/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export const MiniBrowserServicePath = '/services/mini-browser-service';
export const MiniBrowserService = Symbol('MiniBrowserService');
export interface MiniBrowserService {

    /**
     * Resolves to an array of file extensions - priority pairs supported by the `Mini Browser`.
     *
     * The file extensions start without the leading dot (`.`) and should be treated in a case-insensitive way. This means,
     * if the `Mini Browser` supports `['jpg']`, then it can open the `MyPicture.JPG` file.
     */
    supportedFileExtensions(): Promise<Readonly<{ extension: string, priority: number }>[]>;

}
