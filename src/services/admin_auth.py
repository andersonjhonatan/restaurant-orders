import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional


class AdminAuthError(Exception):
    pass


class AdminInvalidCredentials(AdminAuthError):
    pass


class AdminRateLimited(AdminAuthError):
    def __init__(self, retry_after: int) -> None:
        super().__init__("too many login attempts")
        self.retry_after = retry_after


class AdminAuth:
    """Autenticação administrativa com sessão revogável.

    Em produção, as sessões são armazenadas no PostgreSQL. Em desenvolvimento
    sem DATABASE_URL, um armazenamento em memória mantém o fluxo testável sem
    persistir credenciais no navegador.
    """

    def __init__(
        self,
        database_url: Optional[str],
        *,
        username: str,
        password: Optional[str],
        session_hours: int = 8,
        max_attempts: int = 5,
        attempt_window_seconds: int = 900,
    ) -> None:
        self.database_url = database_url
        self.username = (username or "vanuza").strip().casefold()
        self.password = password or ""
        self.session_hours = max(1, session_hours)
        self.max_attempts = max(1, max_attempts)
        self.attempt_window_seconds = max(60, attempt_window_seconds)
        self._memory_sessions: Dict[str, Dict] = {}
        self._memory_attempts = []

    @property
    def database_enabled(self) -> bool:
        return bool(self.database_url)

    @property
    def configured(self) -> bool:
        return bool(self.password)

    def _connect(self):
        import psycopg
        from psycopg.rows import dict_row

        return psycopg.connect(self.database_url, row_factory=dict_row)

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def user_agent_hash(user_agent: str) -> str:
        return hashlib.sha256((user_agent or "").encode("utf-8")).hexdigest()

    def _credentials_valid(self, username: str, password: str) -> bool:
        username_ok = hmac.compare_digest(
            (username or "").strip().casefold(), self.username
        )
        password_ok = bool(self.password) and hmac.compare_digest(
            password or "", self.password
        )
        return username_ok and password_ok

    def _memory_check_rate(self, client_hash: str, username: str) -> None:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=self.attempt_window_seconds)
        normalized_username = (username or "").strip().casefold()
        self._memory_attempts = [
            item for item in self._memory_attempts if item["created_at"] >= cutoff
        ]
        failures = [
            item
            for item in self._memory_attempts
            if not item["success"]
            and (
                item["client_hash"] == client_hash
                or item["username"] == normalized_username
            )
        ]
        if len(failures) >= self.max_attempts:
            raise AdminRateLimited(self.attempt_window_seconds)

    def _record_memory_attempt(
        self, client_hash: str, username: str, success: bool
    ) -> None:
        self._memory_attempts.append(
            {
                "client_hash": client_hash,
                "username": (username or "").strip().casefold(),
                "success": success,
                "created_at": datetime.now(timezone.utc),
            }
        )

    def login(
        self,
        username: str,
        password: str,
        *,
        client_hash: str,
        user_agent: str,
    ) -> str:
        if not self.configured:
            raise AdminAuthError("admin credentials not configured")

        normalized_username = (username or "").strip().casefold()
        success = self._credentials_valid(normalized_username, password)

        if not self.database_enabled:
            self._memory_check_rate(client_hash, normalized_username)
            self._record_memory_attempt(client_hash, normalized_username, success)
            if not success:
                raise AdminInvalidCredentials()
            token = secrets.token_urlsafe(32)
            self._memory_sessions[self._token_hash(token)] = {
                "username": self.username,
                "expires_at": datetime.now(timezone.utc)
                + timedelta(hours=self.session_hours),
                "user_agent_hash": self.user_agent_hash(user_agent),
                "revoked": False,
            }
            return token

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=self.attempt_window_seconds)
        with self._connect() as conn:
            with conn.cursor() as cursor:
                lock_key = f"{client_hash}|{normalized_username}"
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s))", (lock_key,)
                )
                cursor.execute(
                    "DELETE FROM admin_login_events WHERE created_at < NOW() - INTERVAL '1 day'"
                )
                cursor.execute(
                    """
                    SELECT COUNT(*) AS total
                    FROM admin_login_events
                    WHERE success = FALSE
                      AND created_at >= %s
                      AND (client_hash = %s OR username = %s)
                    """,
                    (cutoff, client_hash, normalized_username),
                )
                failures = int(cursor.fetchone()["total"])
                if failures >= self.max_attempts:
                    raise AdminRateLimited(self.attempt_window_seconds)

                cursor.execute(
                    """
                    INSERT INTO admin_login_events (client_hash, username, success)
                    VALUES (%s, %s, %s)
                    """,
                    (client_hash, normalized_username, success),
                )

                if not success:
                    conn.commit()
                    raise AdminInvalidCredentials()

                token = secrets.token_urlsafe(32)
                token_hash = self._token_hash(token)
                expires_at = now + timedelta(hours=self.session_hours)
                cursor.execute(
                    """
                    INSERT INTO admin_sessions (
                        session_hash, username, expires_at, user_agent_hash, client_hash
                    ) VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        token_hash,
                        self.username,
                        expires_at,
                        self.user_agent_hash(user_agent),
                        client_hash,
                    ),
                )
                cursor.execute(
                    """
                    UPDATE admin_sessions
                    SET revoked_at = COALESCE(revoked_at, NOW())
                    WHERE expires_at < NOW() AND revoked_at IS NULL
                    """
                )
            conn.commit()
        return token

    def validate(self, token: str, *, user_agent: str) -> Optional[str]:
        if not token:
            return None
        token_hash = self._token_hash(token)
        expected_ua = self.user_agent_hash(user_agent)

        if not self.database_enabled:
            session = self._memory_sessions.get(token_hash)
            if not session or session["revoked"]:
                return None
            if session["expires_at"] <= datetime.now(timezone.utc):
                return None
            if not hmac.compare_digest(session["user_agent_hash"], expected_ua):
                return None
            return session["username"]

        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT username, user_agent_hash
                    FROM admin_sessions
                    WHERE session_hash = %s
                      AND revoked_at IS NULL
                      AND expires_at > NOW()
                    LIMIT 1
                    """,
                    (token_hash,),
                )
                session = cursor.fetchone()
                if not session:
                    return None
                stored_ua = session.get("user_agent_hash") or ""
                if stored_ua and not hmac.compare_digest(stored_ua, expected_ua):
                    return None
                cursor.execute(
                    """
                    UPDATE admin_sessions
                    SET last_seen_at = NOW()
                    WHERE session_hash = %s
                      AND last_seen_at < NOW() - INTERVAL '5 minutes'
                    """,
                    (token_hash,),
                )
            conn.commit()
        return session["username"]

    def logout(self, token: str) -> None:
        if not token:
            return
        token_hash = self._token_hash(token)
        if not self.database_enabled:
            session = self._memory_sessions.get(token_hash)
            if session:
                session["revoked"] = True
            return

        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE admin_sessions
                    SET revoked_at = COALESCE(revoked_at, NOW())
                    WHERE session_hash = %s
                    """,
                    (token_hash,),
                )
            conn.commit()
