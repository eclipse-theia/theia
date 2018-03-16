/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export class ApplicationError extends Error {

    /**
     * Static code member representing the error
     */
    static readonly CODE: string = "ERR_THEIA";

    /**
     * Instance property representing the error
     */
    code: string;

    constructor(code?: string, message?: string) {
        super(message);
        this.code = code || new.target.CODE; // Applying default
        Object.setPrototypeOf(this, new.target.prototype);
    }

    toJSON() {
        return {
            message: this.message,
            stack: this.stack,
            code: this.code,
        };
    }
}
