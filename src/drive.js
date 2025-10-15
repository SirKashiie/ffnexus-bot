// src/drive.js
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID;
const SA_KEY_PATH = process.env.GDRIVE_SA_KEY_FILE || './secrets/sa.json';
const ALLOWED_MIMES = (process.env.GDRIVE_ALLOWED_MIMES || '').split(',');

// ==========================================================
// 🔹 Autenticação com Google Drive (Service Account)
// ==========================================================
function getDriveClient() {
  if (!fs.existsSync(SA_KEY_PATH)) {
    throw new Error(`[drive] Arquivo de credenciais ausente: ${SA_KEY_PATH}`);
  }

  const key = JSON.parse(fs.readFileSync(SA_KEY_PATH, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

// ==========================================================
// 🔹 Busca arquivos no Drive
// ==========================================================
export async function searchDriveDocs(query) {
  try {
    const drive = getDriveClient();
    const q = [
      `'${FOLDER_ID}' in parents`,
      '(trashed = false)',
      ALLOWED_MIMES.length ? `(${ALLOWED_MIMES.map(t => `mimeType='${t}'`).join(' or ')})` : '',
      query ? `name contains '${query.replace(/'/g, "\\'")}'` : ''
    ].filter(Boolean).join(' and ');

    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, webViewLink, modifiedTime)',
      pageSize: 5,
      orderBy: 'modifiedTime desc',
    });

    return (res.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      link: f.webViewLink,
      modified: f.modifiedTime
    }));
  } catch (err) {
    console.error('[drive] Erro ao buscar documentos:', err.message);
    return [];
  }
}

// ==========================================================
// 🔹 Download (se precisar ler conteúdo real)
// ==========================================================
export async function downloadDriveFile(fileId, outputDir = './data/tmp') {
  const drive = getDriveClient();
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const destPath = path.join(outputDir, `${fileId}.download`);
  const dest = fs.createWriteStream(destPath);

  await new Promise((resolve, reject) => {
    drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
      .then(res => {
        res.data.on('end', resolve)
          .on('error', reject)
          .pipe(dest);
      })
      .catch(reject);
  });

  return destPath;
}
