module.exports = {
    transpileDependencies: ['element-plus'],
    outputDir: 'deploy/dist/public',
    devServer: {
        proxy: 'http://localhost:5050',
        watchOptions: {
            ignored: [/server/],
        },
    },
}
