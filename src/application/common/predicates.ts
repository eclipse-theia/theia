import { injectable, unmanaged } from "inversify";

export declare type PredicateFunc<T> = (arg?: T) => boolean;

export namespace PredicateFunc {

    export function isPredicate<T>(predicate: Predicate<T> | PredicateFunc<T>): predicate is Predicate<T> {
        return (<Predicate<T>>predicate).evaluate !== undefined;
    }

    export function getFunction<T>(predicate: Predicate<T> | PredicateFunc<T>): PredicateFunc<T> {
        return isPredicate(predicate) ? predicate.evaluate : predicate;
    }

    export function or<T>(left: PredicateFunc<T>, right: PredicateFunc<T>): PredicateFunc<T> {
        return (arg: T): boolean => {
            return left(arg) || right(arg);
        }
    }

    export function and<T>(left: PredicateFunc<T>, right: PredicateFunc<T>): PredicateFunc<T> {
        return (arg: T): boolean => {
            return left(arg) && right(arg);
        }
    }

    export function not<T>(left: PredicateFunc<T>): PredicateFunc<T> {
        return (arg: T): boolean => {
            return !left(arg);
        }
    }

}

export interface Predicate<T> {
    evaluate: PredicateFunc<T>
}

export interface PredicateExt<T> extends Predicate<T> {
    or(other: Predicate<T>): PredicateExt<T>;
    and(other: Predicate<T>): PredicateExt<T>;
    not(): PredicateExt<T>;
}

@injectable()
export class PredicateImpl<T> implements PredicateExt<T> {

    public readonly evaluate: PredicateFunc<T>;

    constructor( @unmanaged() predicate: Predicate<T> | PredicateFunc<T>) {
        this.evaluate = PredicateFunc.getFunction(predicate);
    }

    or(other: Predicate<T>): PredicateExt<T> {
        return new PredicateImpl<T>(PredicateFunc.or(this.evaluate, PredicateFunc.getFunction(other)));
    }

    and(other: Predicate<T>): PredicateExt<T> {
        return new PredicateImpl<T>(PredicateFunc.and(this.evaluate, PredicateFunc.getFunction(other)));
    }

    not(): PredicateExt<T> {
        return new PredicateImpl<T>(PredicateFunc.not(this.evaluate));
    }

}