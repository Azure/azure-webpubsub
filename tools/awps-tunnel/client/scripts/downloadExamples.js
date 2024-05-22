const axios = require('axios');
const fs = require('fs');
const path = require('path');

const examplesDir = path.join(__dirname, '../public/examples');
const apiDir = path.join(__dirname, '../src/components/api');

if (!fs.existsSync(examplesDir)) {
	fs.mkdirSync(examplesDir, { recursive: true });
}
if (!fs.existsSync(apiDir)) {
	fs.mkdirSync(apiDir, { recursive: true });
}

const repoPath = 'Azure/azure-rest-api-specs';
const ref = 'main';
const examplesPath = 'specification/webpubsub/data-plane/WebPubSub/stable/2023-07-01/examples';
const apiFilePath = 'specification/webpubsub/data-plane/WebPubSub/stable/2023-07-01/webpubsub.json';

async function downloadFiles() {
	try {
		const examplesUrl = `https://api.github.com/repos/${repoPath}/contents/${examplesPath}?ref=${ref}`;
		const examplesResponse = await axios.get(examplesUrl);
		const files = examplesResponse.data;
		
		for (const file of files) {
			if (file.type === 'file') {
				const fileResponse = await axios.get(file.download_url, { responseType: 'arraybuffer' });
				fs.writeFileSync(path.join(examplesDir, file.name), fileResponse.data);
			}
		}
		console.log("All example files downloaded successfully.")
		
		const apiUrl = `https://api.github.com/repos/${repoPath}/contents/${apiFilePath}?ref=${ref}`;
		const apiResponse = await axios.get(apiUrl, { responseType: 'json' });
		const apiFileResponse = await axios.get(apiResponse.data.download_url, { responseType: 'arraybuffer' });
		fs.writeFileSync(path.join(apiDir, 'restapiSample.json'), apiFileResponse.data);
		console.log('api spec downloaded successfully.');
	} catch (error) {
		console.error('Error downloading files:', error);
	}
}

downloadFiles();
