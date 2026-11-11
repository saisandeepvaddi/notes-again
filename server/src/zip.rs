pub struct ZipWriter {
    out: Vec<u8>,
    entries: Vec<Entry>,
}

struct Entry {
    name: String,
    crc: u32,
    size: u32,
    offset: u32,
}

fn crc32(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for (n, slot) in table.iter_mut().enumerate() {
        let mut c = n as u32;
        for _ in 0..8 {
            c = if c & 1 == 1 {
                0xEDB8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
        }
        *slot = c;
    }
    !data.iter().fold(!0u32, |crc, &byte| {
        table[((crc ^ byte as u32) & 0xFF) as usize] ^ (crc >> 8)
    })
}

const DOS_DATE: u16 = (1 << 5) | 1;

impl ZipWriter {
    pub fn new() -> Self {
        ZipWriter {
            out: vec![],
            entries: vec![],
        }
    }

    pub fn add(&mut self, name: &str, data: &[u8]) {
        let entry = Entry {
            name: name.to_string(),
            crc: crc32(data),
            size: data.len() as u32,
            offset: self.out.len() as u32,
        };
        let out = &mut self.out;
        out.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        out.extend_from_slice(&20u16.to_le_bytes());
        out.extend_from_slice(&0x0800u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&DOS_DATE.to_le_bytes());
        out.extend_from_slice(&entry.crc.to_le_bytes());
        out.extend_from_slice(&entry.size.to_le_bytes());
        out.extend_from_slice(&entry.size.to_le_bytes());
        out.extend_from_slice(&(name.len() as u16).to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(name.as_bytes());
        out.extend_from_slice(data);
        self.entries.push(entry);
    }

    pub fn finish(mut self) -> Vec<u8> {
        let start = self.out.len() as u32;
        for entry in &self.entries {
            let out = &mut self.out;
            out.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
            out.extend_from_slice(&20u16.to_le_bytes());
            out.extend_from_slice(&20u16.to_le_bytes());
            out.extend_from_slice(&0x0800u16.to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(&DOS_DATE.to_le_bytes());
            out.extend_from_slice(&entry.crc.to_le_bytes());
            out.extend_from_slice(&entry.size.to_le_bytes());
            out.extend_from_slice(&entry.size.to_le_bytes());
            out.extend_from_slice(&(entry.name.len() as u16).to_le_bytes());
            out.extend_from_slice(&[0u8; 12]);
            out.extend_from_slice(&entry.offset.to_le_bytes());
            out.extend_from_slice(entry.name.as_bytes());
        }
        let size = self.out.len() as u32 - start;
        let count = self.entries.len() as u16;
        let out = &mut self.out;
        out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
        out.extend_from_slice(&[0u8; 4]);
        out.extend_from_slice(&count.to_le_bytes());
        out.extend_from_slice(&count.to_le_bytes());
        out.extend_from_slice(&size.to_le_bytes());
        out.extend_from_slice(&start.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        self.out
    }
}

impl Default for ZipWriter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc_matches_the_reference_value() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32(b""), 0);
    }

    #[test]
    fn archive_has_a_readable_directory() {
        let mut zip = ZipWriter::new();
        zip.add("a.md", b"hello");
        zip.add("attachments/b.pdf", b"%PDF");
        let bytes = zip.finish();
        let eocd = bytes.len() - 22;
        assert_eq!(&bytes[eocd..eocd + 4], &0x0605_4b50u32.to_le_bytes());
        assert_eq!(u16::from_le_bytes([bytes[eocd + 10], bytes[eocd + 11]]), 2);
        let start = u32::from_le_bytes(bytes[eocd + 16..eocd + 20].try_into().unwrap()) as usize;
        assert_eq!(&bytes[start..start + 4], &0x0201_4b50u32.to_le_bytes());
        assert_eq!(&bytes[0..4], &0x0403_4b50u32.to_le_bytes());
    }
}
