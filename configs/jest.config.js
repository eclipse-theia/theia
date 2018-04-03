module.exports = {
    "globals": {
        "ts-jest": {
            "tsConfigFile": "compile.tsconfig.json"
        }
    },
    "transform": {
        "^.+\\.tsx?$": "ts-jest"
    },
    "testEnvironment": "node",
    "testRegex": "(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
    "moduleFileExtensions": [
        "ts",
        "tsx",
        "js",
        "jsx",
        "json",
        "node"
    ]
}