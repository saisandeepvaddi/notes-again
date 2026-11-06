use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{EncodingKey, Header, encode};
use rsa::RsaPrivateKey;
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::traits::PublicKeyParts;
use serde_json::{Value, json};

pub struct Signer {
    key: EncodingKey,
    pub jwks: JwkSet,
}

fn b64(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

impl Signer {
    pub fn new(kid: &str) -> Signer {
        let private = RsaPrivateKey::new(&mut rand_core::OsRng, 2048).unwrap();
        let pem = private.to_pkcs1_pem(rsa::pkcs1::LineEnding::LF).unwrap();
        let jwks = serde_json::from_value(json!({ "keys": [{
            "kty": "RSA", "kid": kid, "use": "sig", "alg": "RS256",
            "n": b64(&private.n().to_bytes_be()),
            "e": b64(&private.e().to_bytes_be()),
        }]}))
        .unwrap();
        Signer {
            key: EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(),
            jwks,
        }
    }

    pub fn sign(&self, kid: &str, claims: Value) -> String {
        let mut header = Header::new(jsonwebtoken::Algorithm::RS256);
        header.kid = Some(kid.to_string());
        encode(&header, &claims, &self.key).unwrap()
    }
}

pub fn unix_now() -> i64 {
    chrono::Utc::now().timestamp()
}
