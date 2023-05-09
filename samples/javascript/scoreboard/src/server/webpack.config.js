const path = require('path')
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'production',
    target: 'node',
    entry: path.resolve(__dirname, 'app.ts'),
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
                exclude: [
                    /node_modules/,
                    /src\/client\//
                ],
            },
        ],
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [{
                from: path.resolve(__dirname, 'web.config'),
                to: path.resolve(__dirname, '../../dist/web.config'),
            }]
        }),
    ]
}
