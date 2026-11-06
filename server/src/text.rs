use std::sync::LazyLock;

use fancy_regex::Regex as FancyRegex;
use regex::Regex;

static BLOCK_PREFIX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*(?:#{1,6}(?:\s+|$)|>\s?)+").unwrap());
static IMAGE_OR_LINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"!?\[([^\]]*)\]\([^)]*\)").unwrap());
static AUTOLINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<([a-zA-Z][a-zA-Z\d+.-]*:[^>\s]+)>").unwrap());
static CODE: LazyLock<FancyRegex> = LazyLock::new(|| FancyRegex::new(r"(`+)(.+?)\1").unwrap());
static STRONG_OR_STRIKE: LazyLock<FancyRegex> =
    LazyLock::new(|| FancyRegex::new(r"(\*\*|__|~~)(.+?)\1").unwrap());
static STAR_EM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\*(\S(?:.*?\S)?)\*").unwrap());
static UNDERSCORE_EM: LazyLock<FancyRegex> =
    LazyLock::new(|| FancyRegex::new(r"(?<!\w)_(\S(?:.*?\S)?)_(?!\w)").unwrap());
static ESCAPE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\\([!-/:-@\[-`{-~])").unwrap());

fn fancy_replace(
    regex: &FancyRegex,
    text: &str,
    replace: impl Fn(&fancy_regex::Captures<'_, str>) -> String,
) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for caps in regex.captures_iter(text) {
        let Ok(caps) = caps else { break };
        let whole = caps.get(0).expect("group 0 exists");
        out.push_str(&text[last..whole.start()]);
        out.push_str(&replace(&caps));
        last = whole.end();
    }
    out.push_str(&text[last..]);
    out
}

pub fn markdown_title_text(title: &str) -> String {
    let text = BLOCK_PREFIX.replace(title, "").into_owned();
    let text = IMAGE_OR_LINK.replace_all(&text, "$1").into_owned();
    let text = AUTOLINK.replace_all(&text, "$1").into_owned();
    let text = fancy_replace(&CODE, &text, |c| {
        c.get(2)
            .map(|m| m.as_str().trim())
            .unwrap_or("")
            .to_string()
    });
    let text = fancy_replace(&STRONG_OR_STRIKE, &text, |c| {
        c.get(2).map(|m| m.as_str()).unwrap_or("").to_string()
    });
    let text = STAR_EM.replace_all(&text, "$1").into_owned();
    let text = fancy_replace(&UNDERSCORE_EM, &text, |c| {
        c.get(1).map(|m| m.as_str()).unwrap_or("").to_string()
    });
    ESCAPE.replace_all(&text, "$1").into_owned()
}

pub fn splitlines(text: &str) -> Vec<&str> {
    let mut lines = vec![];
    let mut start = 0;
    let mut chars = text.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        let is_break = matches!(
            c,
            '\n' | '\r'
                | '\x0b'
                | '\x0c'
                | '\x1c'
                | '\x1d'
                | '\x1e'
                | '\u{85}'
                | '\u{2028}'
                | '\u{2029}'
        );
        if !is_break {
            continue;
        }
        lines.push(&text[start..i]);
        let mut end = i + c.len_utf8();
        if c == '\r'
            && let Some(&(j, '\n')) = chars.peek()
        {
            chars.next();
            end = j + 1;
        }
        start = end;
    }
    if start < text.len() {
        lines.push(&text[start..]);
    }
    lines
}

pub fn python_split(text: &str) -> Vec<&str> {
    text.split(|c: char| c.is_whitespace() || matches!(c, '\x1c'..='\x1f'))
        .filter(|w| !w.is_empty())
        .collect()
}

pub fn take_chars(text: &str, count: usize) -> &str {
    match text.char_indices().nth(count) {
        Some((i, _)) => &text[..i],
        None => text,
    }
}

pub fn char_len(text: &str) -> usize {
    text.chars().count()
}

pub fn python_strip(text: &str) -> &str {
    text.trim_matches(|c: char| c.is_whitespace() || matches!(c, '\x1c'..='\x1f'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_markdown_from_titles() {
        assert_eq!(markdown_title_text("# Hello **world**"), "Hello world");
        assert_eq!(markdown_title_text("[Two Sum](https://x.dev)"), "Two Sum");
        assert_eq!(
            markdown_title_text("`code` and _em_ and snake_case_name"),
            "code and em and snake_case_name"
        );
        assert_eq!(
            markdown_title_text("> quote \\*not em\\*"),
            "quote \\not em\\"
        );
        assert_eq!(markdown_title_text("~~old~~ new"), "old new");
    }

    #[test]
    fn splits_lines_like_python() {
        assert_eq!(splitlines("a\nb\r\nc\rd"), vec!["a", "b", "c", "d"]);
        assert_eq!(splitlines("a\n"), vec!["a"]);
        assert_eq!(splitlines(""), Vec::<&str>::new());
    }
}
