import {expect} from 'chai';
import 'mocha';
import {Path} from "../src/path";

describe('Path', function () {

    describe('#equals()', function () {
        it('should be equal to path with same segments', function () {
            expect(Path.fromString('path').equals(Path.fromString('path'))).to.be.true
        });
    });

    describe('#equals()', function () {
        it('should not be equal to path with different segments', function () {
            expect(Path.fromString('/path').equals(Path.fromString('path/'))).to.be.false
        });
    });

});