from urllib.parse import parse_qsl, urlencode

from fastapi import FastAPI

# Mantém uma instância detectável pelo runtime e substitui pelo app real abaixo.
app = FastAPI()

from src.app import app as real_app


class RestoreOriginalPath:
    """Restaura a URL pública após o rewrite para a função Python da Vercel."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            pairs = parse_qsl(
                scope.get("query_string", b"").decode("utf-8"),
                keep_blank_values=True,
            )
            original = next(
                (value for key, value in pairs if key == "__original_path"),
                None,
            )
            if original is not None:
                path = "/" + original.lstrip("/")
                scope = dict(scope)
                scope["path"] = path
                scope["raw_path"] = path.encode("utf-8")
                scope["query_string"] = urlencode(
                    [
                        (key, value)
                        for key, value in pairs
                        if key != "__original_path"
                    ],
                    doseq=True,
                ).encode("utf-8")

        await self.inner(scope, receive, send)


app = RestoreOriginalPath(real_app)
