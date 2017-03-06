

export class Path {

    static fromString(path:string) : Path {
        let segments = path.split("/");
        return new Path(segments);
    }

    constructor(public readonly segments: string[]) {
    }

    get simpleName() : string | undefined {
        return this.segments[this.segments.length - 1];
    }

    toString() : string {
        return this.segments.join("/");
    }

    equals(other: Path) : boolean {
        return other.toString() === this.toString();
    }

    get parent() : Path {
        if (this.segments.length === 0) {
            return this;
        }
        return new Path(this.segments.slice(0, this.segments.length - 1))
    }
}
