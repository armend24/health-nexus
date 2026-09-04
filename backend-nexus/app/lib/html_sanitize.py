"""HTML sanitization for user-provided rich text (e.g. contract terms_content)."""

import bleach

# Safe tags for contract/terms content (no script, iframe, object, etc.)
ALLOWED_TAGS = {
    "p",
    "br",
    "div",
    "span",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "a",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
}

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "rel"],
    "td": ["colspan", "rowspan"],
    "th": ["colspan", "rowspan"],
}


def sanitize_html(value: str | None) -> str | None:
    """Sanitize HTML to prevent XSS. Returns None for None or empty string."""
    if value is None:
        return None
    s = value.strip()
    if not s:
        return None
    return bleach.clean(
        s,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True,
    )
