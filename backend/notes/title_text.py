import re

_BLOCK_PREFIX = re.compile(r"^\s*(?:#{1,6}(?:\s+|$)|>\s?)+")
_IMAGE_OR_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_AUTOLINK = re.compile(r"<([a-zA-Z][a-zA-Z\d+.-]*:[^>\s]+)>")
_CODE = re.compile(r"(`+)(.+?)\1")
_STRONG_OR_STRIKE = re.compile(r"(\*\*|__|~~)(.+?)\1")
_STAR_EM = re.compile(r"\*(\S(?:.*?\S)?)\*")
_UNDERSCORE_EM = re.compile(r"(?<!\w)_(\S(?:.*?\S)?)_(?!\w)")
_ESCAPE = re.compile(r"\\([!-/:-@\[-`{-~])")


def markdown_title_text(title: str | None) -> str | None:
    if title is None:
        return None
    text = _BLOCK_PREFIX.sub("", title)
    text = _IMAGE_OR_LINK.sub(r"\1", text)
    text = _AUTOLINK.sub(r"\1", text)
    text = _CODE.sub(lambda m: m.group(2).strip(), text)
    text = _STRONG_OR_STRIKE.sub(r"\2", text)
    text = _STAR_EM.sub(r"\1", text)
    text = _UNDERSCORE_EM.sub(r"\1", text)
    return _ESCAPE.sub(r"\1", text)
