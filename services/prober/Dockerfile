# Build stage of 12-factor V: code + uv.lock -> immutable image. Dependencies are
# installed strictly from the lockfile (--frozen) into an isolated venv.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY . .

RUN useradd --system --uid 10001 app
USER app

# Release id baked into the image; config comes from the environment at run time
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

CMD ["python", "main.py"]
