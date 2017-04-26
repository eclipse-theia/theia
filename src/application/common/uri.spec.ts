import * as chai from "chai"
import URI from "./uri"

const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
});

beforeEach(() => {
});

describe("uri", () => {

    describe("01 #getParent", () => {
        it("should return the parent.", () => {
            expect(new URI("file:///foo/bar.txt").parent().toString()).equals("file:///foo");
        });
    });

    describe("02 #lastSegment", () => {
        it("should return the last segment.", () => {
            expect(new URI("file:///foo").lastSegment()).equals("foo");
            expect(new URI("file:///foo/bar.txt").lastSegment()).equals("bar.txt");
        });
    });

    describe("03 #append", () => {
        it("should return with this when the the segments array is empty.", () => {
            const uri = new URI("file:///foo");
            expect(uri.append()).to.be.equal(uri);
        });
        it("should append a single segment.", () => {
            expect(new URI("file:///foo").append("bar")).to.be.deep.equal(new URI("file:///foo/bar"));
        })
        it("should append multiple segments.", () => {
            expect(new URI("file:///foo").append("bar", "baz")).to.be.deep.equal(new URI("file:///foo/bar/baz"));
        })
    });

});
