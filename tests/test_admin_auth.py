import pytest

from src.services.admin_auth import (
    AdminAuth,
    AdminInvalidCredentials,
    AdminRateLimited,
)


def test_memory_session_login_validate_and_logout():
    auth = AdminAuth(None, username="vanuza", password="segredo", session_hours=8)

    token = auth.login(
        "Vanuza",
        "segredo",
        client_hash="client-1",
        user_agent="browser-1",
    )

    assert auth.validate(token, user_agent="browser-1") == "vanuza"
    assert auth.validate(token, user_agent="outro-browser") is None

    auth.logout(token)
    assert auth.validate(token, user_agent="browser-1") is None


def test_invalid_credentials_are_rejected():
    auth = AdminAuth(None, username="vanuza", password="segredo")

    with pytest.raises(AdminInvalidCredentials):
        auth.login(
            "vanuza",
            "senha-errada",
            client_hash="client-2",
            user_agent="browser-2",
        )


def test_login_rate_limit_blocks_repeated_failures():
    auth = AdminAuth(
        None,
        username="vanuza",
        password="segredo",
        max_attempts=2,
        attempt_window_seconds=900,
    )

    for _ in range(2):
        with pytest.raises(AdminInvalidCredentials):
            auth.login(
                "vanuza",
                "errada",
                client_hash="client-3",
                user_agent="browser-3",
            )

    with pytest.raises(AdminRateLimited):
        auth.login(
            "vanuza",
            "segredo",
            client_hash="client-3",
            user_agent="browser-3",
        )
