const path = require('path')

const { NODE_ENV = 'production' } = process.env

module.exports = {
    mode: NODE_ENV,
    target: 'node',
    entry: './app.ts',
    output: {
        path: path.resolve(__dirname, '../../dist'),
        filename: 'app.js',
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: ['ts-loader'],
            },
        ],
    },
}
