"""
Type stub for the `decky` module that decky-loader injects into every
plugin's main.py at runtime. Not used at runtime - editor/type-checker
convenience only. Copied from the official decky-plugin-template.
"""
from logging import Logger
from typing import Any

logger: Logger

DECKY_VERSION: str
DECKY_USER: str
DECKY_USER_HOME: str
DECKY_HOME: str
DECKY_PLUGIN_SETTINGS_DIR: str
DECKY_PLUGIN_RUNTIME_DIR: str
DECKY_PLUGIN_LOG_DIR: str
DECKY_PLUGIN_DIR: str
DECKY_PLUGIN_NAME: str
DECKY_PLUGIN_VERSION: str
DECKY_PLUGIN_AUTHOR: str

async def emit(event: str, *args: Any) -> None: ...
