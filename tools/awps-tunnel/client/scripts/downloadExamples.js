const axios = require('axios');
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '../public/examples');

if (!fs.existsSync(targetDir)) {
	fs.mkdirSync(targetDir, { recursive: true });
}

const repoPath = 'Azure/azure-rest-api-specs';
const ref = 'main';
const basePath = 'specification/webpubsub/data-plane/WebPubSub/stable';

async function downloadFiles(url, savePath) {
	try {
		const response = await axios.get(url, { responseType: 'json' });
		const items = response.data;
		for (const item of items) {
			const filePath = path.join(savePath, item.name);
			
			if (item.type === 'dir') {
				if (!fs.existsSync(filePath)) {
					fs.mkdirSync(filePath, { recursive: true });
				}
				const nextUrl = `https://api.github.com/repos/${repoPath}/contents/${item.path}?ref=${ref}`;
				await downloadFiles(nextUrl, filePath);
			} else if (item.type === 'file') {
				const fileResponse = await axios.get(item.download_url, { responseType: 'arraybuffer' });
				fs.writeFileSync(filePath, fileResponse.data);
			}
		}
	} catch (error) {
		console.error('Error downloading files:', error);
	}
}

const initialUrl = `https://api.github.com/repos/${repoPath}/contents/${basePath}?ref=${ref}`;
downloadFiles(initialUrl, targetDir);
