// todo: use a base config shared with client and server
const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { VueLoaderPlugin } = require('vue-loader')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isDev = process.env.NODE_ENV !== "production"

let config = {
    mode: isDev ? "development" : "production",
    output: {
        filename: 'js/[name].[contenthash].js',
        path: path.resolve(__dirname, '../../dist/')
    },
    entry: path.resolve(__dirname, './main.ts'),
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [
                    {
                        loader: MiniCssExtractPlugin.loader,
                    },
                    'css-loader',
                    'postcss-loader',
                ],
            },
            {
                test: /\.scss$/,
                use: [
                    {
                        loader: 'style-loader',
                    },
                    {
                        loader: 'css-loader',
                    },
                    {
                        loader: 'sass-loader',
                    },
                ],
            },
            {
                test: /\.svg$/,
                use: ['vue-loader', 'vue-svg-loader'],
            },
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    appendTsSuffixTo: [/\.vue$/],
                    configFile: './tsconfig.json',
                },
                exclude: [
                    /node_modules/,
                    /src\/server\//
                ],
            },
            {
                test: /\.vue$/,
                use: 'vue-loader',
            },
            {
                test: /\.m?js/,
                resolve: {
                    fullySpecified: false,
                },
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js', '.vue', '.json'],
        alias: {
            vue: '@vue/runtime-dom',
        },
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, 'public/index.html'),
            filename: 'index.html',
            title: 'Scoreboard Live Demo',
        }),
        new VueLoaderPlugin(),
        new MiniCssExtractPlugin({
            filename: 'css/[name].css',
            chunkFilename: 'css/[id].css',
        }),
        new CopyWebpackPlugin({
            patterns: [{
                from: path.resolve(__dirname, 'public/images'),
                to: path.resolve(__dirname, '../../dist/images'),
            }]
        }),
    ],
}

if (isDev) {
    config.devServer = {
        port: 3000,
        static: __dirname + "/public/",
        compress: true,
        proxy: {
            '/img': { target: 'http://localhost:5050' },
            '/negotiate': { target: 'http://localhost:5050' },
        }
    }
    config.devtool = 'inline-source-map'
}
module.exports = config;
