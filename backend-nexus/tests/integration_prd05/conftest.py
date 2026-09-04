"""PRD-05 integration test suite conftest: register marker and expose prd05 fixtures."""

import pytest

pytest_plugins = ["tests.integration_prd05.fixtures"]


def pytest_configure(config):
    config.addinivalue_line("markers", "prd05: PRD-05 integration tests.")
