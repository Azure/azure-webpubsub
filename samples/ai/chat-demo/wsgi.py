"""
WSGI entrypoint for Azure App Service / Oryx.

By exposing `app` from the package module (`python_server.application`),
Gunicorn can import `wsgi:app` while allowing the application module to
be loaded within its proper package context. This avoids the
"attempted relative import with no known parent package" error that
occurs when Oryx uses `application:app` directly.
"""

from python_server.application import app as app

