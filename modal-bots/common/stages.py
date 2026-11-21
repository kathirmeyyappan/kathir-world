"""The map's stages, a file each in ``map/``, which ``npm run bot-map`` builds from the TypeScript
content and sim (``packages/shared/src/sim/botMap.ts``). A bot loads only the stages it needs: the
circle bot the outline and the bodies, a few KB; a combat bot the whole map (``world.py``)."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any

MAP_DIR = Path(__file__).with_name("map")


def read_stage(name: str) -> Any:
    with gzip.open(MAP_DIR / f"{name}.json.gz", "rt", encoding="utf-8") as f:
        return json.load(f)
