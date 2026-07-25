const fs = require('fs');
const path = require('path');

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function saveClientPhotos(project, files) {
  if (!files || files.length === 0) return { saved: 0 };

  const baseDir = process.env.CLIENT_ASSETS_DIR
    || path.join(__dirname, '..', '..', 'client-assets');

  const slug = `${slugify(project.clientName)}-${project._id}`;
  const dir = path.join(baseDir, slug);

  fs.mkdirSync(dir, { recursive: true });

  files.forEach((file, index) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `foto-${String(index + 1).padStart(2, '0')}${ext}`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);
  });

  return { saved: files.length, dir };
}

module.exports = { saveClientPhotos, slugify };