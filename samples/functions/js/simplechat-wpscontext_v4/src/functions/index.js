const { app } = require('@azure/functions');
const { readFile, readFileSync } = require('fs');
let fs = require('fs');

app.http('index', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async () => {
        const content = await fs.promises.readFile('index.html', 'utf8', (err, data) => {
            if (err) {
                console.error(err)
                return
            }
        });

        return { 
            status: 200,
            headers: { 
                'Content-Type': 'text/html'
            }, 
            body: content, 
        };
    }
});
