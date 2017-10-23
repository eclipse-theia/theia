
import * as chai from 'chai';
// import * as assert from 'assert';
import * as chaiAsPromised from 'chai-as-promised';
// import URI from "@theia/core/lib/common/uri";
import { Endpoint } from "@theia/core/src/browser/endpoint";
// import { Logger } from "@theia/core/lib/common";
// import * as sinon from 'sinon';

const expect = chai.expect;

describe("Endpoint", () => {

    before(() => {
        chai.config.showDiff = true;
        chai.config.includeStack = true;
        chai.should();
        chai.use(chaiAsPromised);
    });

    beforeEach(() => {
    });

    after(() => {
    });

    describe("01 #getWebSocketUrl", () => {

        it("Should correctly join paths and separators", () => {
            const mockLocation = new Endpoint.Location()
            mockLocation.host = "example.org"
            mockLocation.pathname = "/"

            const cut = new Endpoint({ httpScheme: "ws", path: "/miau/" }, mockLocation)
            const uri = cut.getWebSocketUrl()

            expect(uri.toString()).to.eq("ws://example.org/miau/")
        });

        it("Should correctly join paths and separators", () => {
            const mockLocation = new Endpoint.Location()
            mockLocation.host = "example.org"
            mockLocation.pathname = "/mainresource"

            const cut = new Endpoint({ httpScheme: "ws", path: "/miau/" }, mockLocation)
            const uri = cut.getWebSocketUrl()

            expect(uri.toString()).to.eq("ws://example.org/mainresource/miau/")
        });

        it("Should correctly join paths and separators", () => {
            const mockLocation = new Endpoint.Location()
            mockLocation.host = "example.org"
            mockLocation.pathname = "/mainresource/"

            const cut = new Endpoint({ httpScheme: "ws", path: "/miau/" }, mockLocation)
            const uri = cut.getWebSocketUrl()

            expect(uri.toString()).to.eq("ws://example.org/mainresource/miau/")
        });

        it("Should correctly join paths and separators", () => {
            const mockLocation = new Endpoint.Location()
            mockLocation.host = "example.org"
            mockLocation.pathname = "/mainresource"

            const cut = new Endpoint({ httpScheme: "ws", path: "/miau" }, mockLocation)
            const uri = cut.getWebSocketUrl()

            expect(uri.toString()).to.eq("ws://example.org/mainresource/miau")
        });
    });
});
