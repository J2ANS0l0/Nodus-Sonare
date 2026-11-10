"""Domain rules: node palette and the error -> HTTP status mapping."""
import pytest

from app.domain import palette
from app.domain.exceptions import (
    AuthenticationError,
    ConflictError,
    DomainError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)


class TestPalette:
    def test_palette_has_twelve_distinct_hex_colors(self):
        assert len(palette.NODE_PALETTE) == 12
        assert len({c.lower() for c in palette.NODE_PALETTE}) == 12
        assert all(c.startswith("#") and len(c) == 7 for c in palette.NODE_PALETTE)

    def test_palette_excludes_black_and_white(self):
        """The graph background would hide black/white nodes (rule from paleta.jpeg)."""
        assert not palette.is_palette_color("#000000")
        assert not palette.is_palette_color("#ffffff")

    @pytest.mark.parametrize("color", ["#f22452", "#F22452", "#FD3399"])
    def test_is_palette_color_accepts_palette_colors_case_insensitively(self, color):
        """EP: valid partition (palette color, any letter case)."""
        assert palette.is_palette_color(color)

    @pytest.mark.parametrize("color", ["#f22453", "red", "", "f22452"])
    def test_is_palette_color_rejects_anything_else(self, color):
        """EP: invalid partition (near miss, color name, empty, missing #)."""
        assert not palette.is_palette_color(color)

    def test_random_palette_color_always_returns_a_palette_color(self):
        assert all(palette.random_palette_color() in palette.NODE_PALETTE for _ in range(200))


class TestDomainErrors:
    @pytest.mark.parametrize(
        ("error", "status"),
        [
            (DomainError, 400),
            (ValidationError, 400),
            (AuthenticationError, 401),
            (PermissionDeniedError, 403),
            (NotFoundError, 404),
            (ConflictError, 409),
        ],
    )
    def test_each_error_carries_its_http_status_and_message(self, error, status):
        exc = error("boom")
        assert exc.status_code == status
        assert exc.message == "boom"
        assert str(exc) == "boom"
        assert isinstance(exc, DomainError)
