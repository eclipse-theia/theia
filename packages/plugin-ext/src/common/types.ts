/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

/**
 * Returns `true` if the parameter has type "object" and not null, an array, a regexp, a date.
 */
// tslint:disable-next-line:no-any
export function isObject(obj: any): boolean {
    return typeof obj === 'object'
        && obj !== null
        && !Array.isArray(obj)
        && !(obj instanceof RegExp)
        && !(obj instanceof Date);
}

// tslint:disable-next-line:no-any
export function mixin(destination: any, source: any, overwrite: boolean = true): any {
    if (!isObject(destination)) {
        return source;
    }

    if (isObject(source)) {
        Object.keys(source).forEach(key => {
            if (key in destination) {
                if (overwrite) {
                    if (isObject(destination[key]) && isObject(source[key])) {
                        mixin(destination[key], source[key], overwrite);
                    } else {
                        destination[key] = source[key];
                    }
                }
            } else {
                destination[key] = source[key];
            }
        });
    }
    return destination;
}

export enum LogType {
    Info,
    Error
}

export interface LogPart {
    data: string;
    type: LogType;
}

// tslint:disable-next-line:no-any
export interface KeysToAnyValues { [key: string]: any }
export interface KeysToKeysToAnyValue { [key: string]: KeysToAnyValues }

// tslint:disable:no-any
/** copied from https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/workbench/api/common/extHostTypes.ts#L18-L27 */
export function es5ClassCompat<T extends Function>(target: T): T {
    /// @ts-ignore
    function _(): any { return Reflect.construct(target, arguments, this.constructor); }
    Object.defineProperty(_, 'name', Object.getOwnPropertyDescriptor(target, 'name')!);
    Object.setPrototypeOf(_, target);
    Object.setPrototypeOf(_.prototype, target.prototype);
    return _ as unknown as T;
}
// tslint:enable:no-any
