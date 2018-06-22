/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
