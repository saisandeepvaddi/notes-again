CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(name, content, content='notes', content_rowid='id', tokenize='trigram remove_diacritics 1');
