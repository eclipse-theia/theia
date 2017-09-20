/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/* note: this bogus test file is required so that
   we are able to run mocha unit tests on this
   package, without having any actual unit tests in it.
   This way a coverage report will be generated,
   showing 0% coverage, instead of no report.
   This file can be removed once we have real unit
   tests in place. */

describe("preferences-api package", () => {

    it("support code coverage statistics", () => {
        return true;
    })
});
