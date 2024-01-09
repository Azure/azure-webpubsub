const { app } = require('@azure/functions');
const { readFile } = require('fs/promises');

app.http('index', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async () => {
        const content = await readFile('index.html', 'utf8', (err, data) => {
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
