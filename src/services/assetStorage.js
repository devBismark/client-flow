const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uploadBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (error, result) => {
      if (error) return reject(error);
      resolve(result.secure_url);
    });
    stream.end(buffer);
  });
}

function saveLocalCopy(files, slug) {
  const baseDir = process.env.CLIENT_ASSETS_DIR;
  console.log('DEBUG saveLocalCopy baseDir:', baseDir);
  if (!baseDir) return;

  const dir = path.join(baseDir, slug);
  console.log('DEBUG saveLocalCopy dir final:', dir);
  fs.mkdirSync(dir, { recursive: true });

  files.forEach((file, index) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `foto-${String(index + 1).padStart(2, '0')}${ext}`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);
  });
}

async function saveClientPhotos(project, files) {
  if (!files || files.length === 0) return { saved: 0, urls: [] };

  const slug = `${slugify(project.clientName)}-${project._id}`;
  const folder = `client-flow/${slug}`;

  const urls = await Promise.all(files.map((file) => uploadBuffer(file.buffer, folder)));

  saveLocalCopy(files, slug);

  project.photoUrls = urls;
  await project.save();

  return { saved: urls.length, urls };
}

module.exports = { saveClientPhotos, slugify };