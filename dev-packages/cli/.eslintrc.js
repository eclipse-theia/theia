/** @type {import('eslint').Linter.Config} */
module.exports = {
    extends: [
        '../../configs/build.eslintrc.json'
    ],
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: 'compile.tsconfig.json'
    },
    // rules: {
    //     '@typescript-eslint/member-ordering': [true, [
    //         // Index signature
    //         'signature',

    //         // Fields
    //         'public-static-field',
    //         'protected-static-field',
    //         'private-static-field',
    //         'public-instance-field',
    //         'public-abstract-field',
    //         'public-decorated-field',
    //         'protected-instance-field',
    //         'protected-abstract-field',
    //         'protected-decorated-field',
    //         'private-instance-field',
    //         'private-abstract-field',
    //         'private-decorated-field',

    //         // Constructors
    //         'public-constructor',
    //         'protected-constructor',
    //         'private-constructor',

    //         // Methods
    //         'public-static-method',
    //         'protected-static-method',
    //         'private-static-method',
    //         'public-decorated-method',
    //         'protected-decorated-method',
    //         'private-decorated-method',
    //         'public-instance-method',
    //         'protected-instance-method',
    //         'private-instance-method',
    //         'public-abstract-method',
    //         'protected-abstract-method',
    //         'private-abstract-method'
    //     ]]
    // }
};
