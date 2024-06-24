const express = require('express');
const app = express();
const path = require('path');

async function main() {
    app.use(express.static(path.join(__dirname, 'public')));
    app.listen(3000, () => {
        console.log('Visit http://localhost:%d', 3000);
    });
}

main();