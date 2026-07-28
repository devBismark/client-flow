class ZipArchive {
  pipe() { return this; }
  append() { return this; }
  async finalize() {}
}

module.exports = { ZipArchive, Archiver: ZipArchive };
