const path = require('path')

module.exports = {
    transpileDependencies: ['element-plus'],
    outputDir: 'dist/public',
    devServer: {
        proxy: 'http://localhost:5050',
        static: {
            directory: path.join(__dirname, 'src', 'server'),
            watch: false,
        },
    },
}
