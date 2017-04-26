import "mocha";
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

describe('uri', () => {

    describe('01 #getParent', () => {
        it('should return the parent.', () => {
            expect(new URI('file:///foo/bar.txt').parent().toString()).equals("file:///foo");
        });
    });
    describe('01 #lastSegment', () => {
        it('should return the last segment.', () => {
            expect(new URI('file:///foo').lastSegment()).equals("foo");
            expect(new URI('file:///foo/bar.txt').lastSegment()).equals("bar.txt");
        });
    });
});
