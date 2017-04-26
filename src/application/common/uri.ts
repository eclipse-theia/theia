export default class URI {

    constructor(private uri: string) {
    }

    parent(): URI {
        return new URI(this.uri.substring(0, this.uri.lastIndexOf('/')));
    }

    lastSegment(): string {
        // TODO trim queries and fragments
        return this.uri.substr(this.uri.lastIndexOf('/') + 1);
    }

    append(...segments: string[]) {
        if (!segments || segments.length === 0) {
            return this;
        }
        const copy = segments.slice(0);
        copy.unshift(this.uri);
        return new URI(copy.join('/'));
    }

    toString() {
        return this.uri;
    }

}