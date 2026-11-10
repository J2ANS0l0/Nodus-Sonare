"""Shared fixtures for the unit layer. Every test here is marked `unit` automatically."""
import pytest

from tests.unit.fakes import (
    FakeNodeRepository,
    FakeObjectStorage,
    FakePasswordHasher,
    FakeTokenService,
    FakeUserRepository,
    make_author_node,
    make_user,
)


def pytest_collection_modifyitems(items):
    for item in items:
        if "tests/unit" in item.nodeid.replace("\\", "/"):
            item.add_marker(pytest.mark.unit)


@pytest.fixture
def user():
    return make_user()


@pytest.fixture
def users(user):
    return FakeUserRepository([user])


@pytest.fixture
def nodes(user):
    return FakeNodeRepository([make_author_node("1", user)])


@pytest.fixture
def hasher():
    return FakePasswordHasher()


@pytest.fixture
def tokens():
    return FakeTokenService()


@pytest.fixture
def storage():
    return FakeObjectStorage()
