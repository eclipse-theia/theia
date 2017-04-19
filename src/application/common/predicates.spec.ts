import { expect } from "chai";
import { PredicateExt, PredicateFunc, PredicateImpl } from './predicates';

function create<T>(func: PredicateFunc<T>): PredicateExt<T> {
    return new PredicateImpl<T>(func);
}

function True() {
    return create(() => true);
}

function False() {
    return create(() => false);
}

describe('predicates', () => {

    describe('negation', () => {

        it('Should be false when negating true.', () => {
            expect(False().not().evaluate()).to.be.true;
        });

        it('Should be true when negating false.', () => {
            expect(True().not().evaluate()).to.be.false;
        });

        it('Should be true when negating true twice.', () => {
            expect(True().not().not().evaluate()).to.be.true;
        });

        it('Should be false when negating false twice.', () => {
            expect(False().not().not().evaluate()).to.be.false;
        });

    });

    describe('conjunction', () => {

        it('Should be true when ANDing true with true.', () => {
            expect(True().and(True()).evaluate()).to.be.true;
        });

        it('Should be false when ANDing true with false.', () => {
            expect(True().and(False()).evaluate()).to.be.false;
        });

        it('Should be false when ANDing false with true.', () => {
            expect(False().and(True()).evaluate()).to.be.false;
        });

        it('Should be false when ANDing false with false.', () => {
            expect(False().and(False()).evaluate()).to.be.false;
        });

    });

    describe('disjunction', () => {

        it('Should be true when ORing true with true.', () => {
            expect(True().or(True()).evaluate()).to.be.true;
        });

        it('Should be true when ORing true with false.', () => {
            expect(True().or(False()).evaluate()).to.be.true;
        });

        it('Should be true when ORing false with true.', () => {
            expect(False().or(True()).evaluate()).to.be.true;
        });

        it('Should be false when ORing false with false.', () => {
            expect(False().or(False()).evaluate()).to.be.false;
        });

    });

});