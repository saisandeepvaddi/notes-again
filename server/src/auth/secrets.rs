use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

const SCRYPT_LOG_N: u8 = 14;
const SCRYPT_R: u32 = 8;
const SCRYPT_P: u32 = 1;
const KEY_LENGTH: usize = 64;
pub const MIN_PASSWORD_LENGTH: usize = 8;

pub fn random_bytes(count: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; count];
    getrandom::fill(&mut bytes).expect("the OS random source is unavailable");
    bytes
}

pub fn token_urlsafe(count: usize) -> String {
    URL_SAFE_NO_PAD.encode(random_bytes(count))
}

pub fn sha256_hex(text: &str) -> String {
    hex::encode(Sha256::digest(text.as_bytes()))
}

pub fn constant_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.ct_eq(b).into()
}

fn unb64(text: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(text.trim_end_matches('=')).ok()
}

fn derive(password: &str, salt: &[u8], log_n: u8, r: u32, p: u32) -> Option<Vec<u8>> {
    let params = scrypt::Params::new(log_n, r, p).ok()?;
    let mut out = vec![0u8; KEY_LENGTH];
    scrypt::scrypt(password.as_bytes(), salt, &params, &mut out).ok()?;
    Some(out)
}

pub fn hash_password(password: &str) -> String {
    let salt = random_bytes(16);
    let key =
        derive(password, &salt, SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P).expect("valid scrypt parameters");
    format!(
        "scrypt${}${}${}${}${}",
        1u64 << SCRYPT_LOG_N,
        SCRYPT_R,
        SCRYPT_P,
        URL_SAFE_NO_PAD.encode(salt),
        URL_SAFE_NO_PAD.encode(key)
    )
}

pub fn verify_password(password: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.split('$').collect();
    let [scheme, n, r, p, salt, key] = parts.as_slice() else {
        return false;
    };
    if *scheme != "scrypt" {
        return false;
    }
    let (Ok(n), Ok(r), Ok(p)) = (n.parse::<u64>(), r.parse::<u32>(), p.parse::<u32>()) else {
        return false;
    };
    if n < 2 || !n.is_power_of_two() {
        return false;
    }
    let log_n = n.trailing_zeros() as u8;
    let (Some(salt), Some(expected)) = (unb64(salt), unb64(key)) else {
        return false;
    };
    let params = match scrypt::Params::new(log_n, r, p) {
        Ok(params) => params,
        Err(_) => return false,
    };
    let mut actual = vec![0u8; expected.len().max(1)];
    if scrypt::scrypt(password.as_bytes(), &salt, &params, &mut actual).is_err() {
        return false;
    }
    constant_eq(&actual, &expected)
}

pub fn generate_password() -> String {
    token_urlsafe(12)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_verify() {
        let stored = hash_password("correct horse");
        assert!(verify_password("correct horse", &stored));
        assert!(!verify_password("wrong", &stored));
    }

    #[test]
    fn verifies_python_hashes() {
        let stored = "scrypt$16384$8$1$h3RmeptNENnek9KYrs5jeA$VNynvhfKqNMLifwl-DBH5f7W7HQ8OtAze9Mw6BhSbUM4PcoZJB7vGcJi7HXnOURVQeuGh_thBC9hEesmuCeKCQ";
        assert!(verify_password("hunter2hunter2", stored));
        assert!(!verify_password("hunter2", stored));
    }
}
