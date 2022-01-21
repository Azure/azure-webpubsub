module.exports = {
    outputDir: 'dist/dist-client',
    devServer: {
        proxy: 'http://localhost:5050',
        watchOptions: {
            ignored: [/server/],
        },
    },
}
