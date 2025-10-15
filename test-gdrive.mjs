import fs from 'fs';
import { google } from 'googleapis';
import 'dotenv/config';

async function main() {
  try {
    const keyPath = process.env.GDRIVE_SA_KEY_FILE || './secrets/sa.json';
    const folderId = process.env.GDRIVE_FOLDER_ID;
    if (!folderId) throw new Error('GDRIVE_FOLDER_ID ausente no .env');

    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const scopes = ['https://www.googleapis.com/auth/drive.readonly'];

    const jwt = new google.auth.JWT(key.client_email, null, key.private_key, scopes);
    const drive = google.drive({ version: 'v3', auth: jwt });

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 20,
    });

    console.log('Arquivos na pasta:', res.data.files?.length || 0);
    for (const f of res.data.files || []) {
      console.log(`- ${f.name}  (${f.mimeType})  [${f.id}]`);
    }
  } catch (err) {
    console.error('ERRO:', err.message || err);
    process.exit(1);
  }
}

main();
