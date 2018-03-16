/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { expect } from 'chai';
import { ApplicationError } from "./error";

enum TestErrorCode {
    FRONTEND = "ERR_THEIA_FRONTEND",
    BACKEND = "ERR_THEIA_BACKEND",
}

describe("Application Errors", () => {

    it("throw custom error code", () => {
        const errorCode = "ERR_TEST";
        const backendError = new ApplicationError(errorCode);
        const frontendError = new ApplicationError(errorCode);

        try {
            throw backendError;
        } catch (e) {
            expect(backendError).to.be.instanceof(ApplicationError);
            expect(backendError.code).to.be.equal(errorCode);
        }

        try {
            throw frontendError;
        } catch (e) {
            expect(frontendError).to.be.instanceof(ApplicationError);
            expect(frontendError.code).to.be.equal(errorCode);
        }

    });

    it("error serialization should still allow us to test errors", () => {
        const frontendError = new ApplicationError(TestErrorCode.FRONTEND, "TEST: no error actually happened in the frontend");
        const backendError = new ApplicationError(TestErrorCode.BACKEND, "TEST: no error actually happened in the backend");

        const serializedFrontendError = JSON.stringify(frontendError);
        const serializedBackendError = JSON.stringify(backendError);

        console.log(serializedBackendError);
        console.log(serializedFrontendError);

        const deserializedFrontendError: ApplicationError = JSON.parse(serializedFrontendError);
        const deserializedBackendError: ApplicationError = JSON.parse(serializedBackendError);

        expect(deserializedFrontendError).to.not.be.instanceof(ApplicationError);
        expect(deserializedFrontendError).to.have.property("message");
        expect(deserializedFrontendError).to.have.property("stack");
        expect(deserializedFrontendError).to.have.property("code");
        expect(deserializedFrontendError.code).to.be.equal(frontendError.code);

        expect(deserializedBackendError).to.not.be.instanceof(ApplicationError);
        expect(deserializedBackendError).to.have.property("message");
        expect(deserializedBackendError).to.have.property("stack");
        expect(deserializedBackendError).to.have.property("code");
        expect(deserializedBackendError.code).to.be.equal(backendError.code);
    });

});
