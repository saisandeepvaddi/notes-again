use std::net::{IpAddr, SocketAddr};

use axum::extract::ConnectInfo;
use axum::http::HeaderMap;
use axum::http::request::Parts;
use ipnet::IpNet;

#[derive(Clone, Debug)]
pub struct RequestMeta {
    pub peer: Option<String>,
    pub client: Option<String>,
    pub scheme: String,
}

fn parse_ip(host: &str) -> Option<IpAddr> {
    host.trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse()
        .ok()
}

pub fn is_trusted(host: Option<&str>, entries: &[String]) -> bool {
    let Some(host) = host else { return false };
    if entries.iter().any(|e| e == "*") {
        return true;
    }
    let Some(address) = parse_ip(host) else {
        return false;
    };
    entries.iter().any(|entry| {
        if let Ok(net) = entry.parse::<IpNet>() {
            return net.contains(&address);
        }
        match parse_ip(entry) {
            Some(ip) => ip == address,
            None => {
                tracing::warn!(
                    "Ignoring TRUSTED_PROXIES entry that isn't an IP or network: {entry}"
                );
                false
            }
        }
    })
}

pub fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}

impl RequestMeta {
    pub fn from_parts(parts: &Parts, trusted: &[String]) -> RequestMeta {
        let peer = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|info| info.0.ip().to_string());
        let mut client = peer.clone();
        let mut scheme = "http".to_string();
        if is_trusted(peer.as_deref(), trusted) {
            if let Some(proto) = header(&parts.headers, "x-forwarded-proto") {
                let proto = proto.split(',').next().unwrap_or("").trim().to_lowercase();
                if matches!(proto.as_str(), "http" | "https" | "ws" | "wss") {
                    scheme = proto;
                }
            }
            if let Some(forwarded) = header(&parts.headers, "x-forwarded-for") {
                let hosts: Vec<&str> = forwarded
                    .split(',')
                    .map(str::trim)
                    .filter(|h| !h.is_empty())
                    .collect();
                let chosen = hosts
                    .iter()
                    .rev()
                    .find(|host| !is_trusted(Some(host), trusted))
                    .or_else(|| hosts.first());
                if let Some(host) = chosen {
                    client = Some(host.to_string());
                }
            }
        }
        RequestMeta {
            peer,
            client,
            scheme,
        }
    }
}

pub fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    for value in headers.get_all("cookie") {
        let Ok(text) = value.to_str() else { continue };
        for pair in text.split(';') {
            let Some((key, val)) = pair.trim().split_once('=') else {
                continue;
            };
            if key.trim() == name {
                let val = val.trim().trim_matches('"');
                return Some(
                    percent_encoding::percent_decode_str(val)
                        .decode_utf8_lossy()
                        .into_owned(),
                );
            }
        }
    }
    None
}

pub fn set_cookie(
    name: &str,
    value: &str,
    max_age: Option<i64>,
    same_site: &str,
    secure: bool,
) -> String {
    let mut parts = vec![format!("{name}={value}"), "HttpOnly".to_string()];
    if let Some(age) = max_age {
        parts.push(format!("Max-Age={age}"));
    }
    parts.push("Path=/".into());
    parts.push(format!("SameSite={same_site}"));
    if secure {
        parts.push("Secure".into());
    }
    parts.join("; ")
}

pub fn delete_cookie(name: &str) -> String {
    format!("{name}=\"\"; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; SameSite=lax")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trusts_networks_and_addresses() {
        let entries = vec!["127.0.0.1".to_string(), "10.0.0.0/8".to_string()];
        assert!(is_trusted(Some("127.0.0.1"), &entries));
        assert!(is_trusted(Some("10.2.3.4"), &entries));
        assert!(!is_trusted(Some("192.168.1.2"), &entries));
        assert!(!is_trusted(None, &entries));
        assert!(is_trusted(Some("8.8.8.8"), &["*".to_string()]));
        let defaults = vec!["127.0.0.1".to_string(), "::1".to_string()];
        assert!(is_trusted(Some("::1"), &defaults));
        assert!(!is_trusted(Some("10.0.0.5"), &defaults));
        assert!(!is_trusted(Some("testclient"), &defaults));
        let mixed = vec!["10.0.0.0/8".to_string(), "192.168.1.2".to_string()];
        assert!(is_trusted(Some("192.168.1.2"), &mixed));
        assert!(!is_trusted(Some("172.17.0.1"), &mixed));
    }
}
