"""
O'zbekiston tumanlari ro'yxatini GADM chegaralaridan yasaydi.

Manba: https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_UZB_2.json
       (tuman chegaralari, NAME_1 = viloyat, NAME_2 = tuman)

Toshkent shahri tumanlari GADM'da alohida yo'q — ular qo'lda qo'shiladi.

Natija: src/data/uzbekistan-places.ts

Ishlatish:
    python scripts/build-places.py path/to/gadm41_UZB_2.json
"""

from __future__ import annotations

import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data", "uzbekistan-places.ts")


def ring_centroid(ring: list[list[float]]) -> tuple[float, float, float]:
    """Shoelace bo'yicha yuzali markaz. (lat, lon, area) qaytaradi."""
    area = 0.0
    cx = 0.0
    cy = 0.0

    for index in range(len(ring) - 1):
        lon1, lat1 = ring[index][0], ring[index][1]
        lon2, lat2 = ring[index + 1][0], ring[index + 1][1]
        cross = lon1 * lat2 - lon2 * lat1
        area += cross
        cx += (lon1 + lon2) * cross
        cy += (lat1 + lat2) * cross

    area *= 0.5
    if area == 0:
        return (ring[0][1], ring[0][0], 0.0)

    cx /= 6 * area
    cy /= 6 * area
    return (cy, cx, abs(area))


def feature_centroid(geometry: dict) -> tuple[float, float] | None:
    kind = geometry.get("type")
    coords = geometry.get("coordinates")

    polygons: list[list[list[list[float]]]]
    if kind == "Polygon":
        polygons = [coords]
    elif kind == "MultiPolygon":
        polygons = coords
    else:
        return None

    best: tuple[float, float, float] | None = None
    for polygon in polygons:
        if not polygon or not polygon[0]:
            continue
        lat, lon, area = ring_centroid(polygon[0])
        if best is None or area > best[2]:
            best = (lat, lon, area)

    if best is None:
        return None
    return (round(best[0], 4), round(best[1], 4))


REGION_NAMES = {
    "ToshkentShahri": "Toshkent shahri",
    "Toshkent": "Toshkent viloyati",
    "Samarqand'": "Samarqand",
    "Qaraqalpaqstan": "Qoraqalpog'iston",
    "Farg'ona": "Farg'ona",
}

# Toshkent shahrining ma'muriy tumanlari (GADM 2-darajasida yo'q)
TASHKENT_DISTRICTS = [
    ("Bektemir", 41.2197, 69.3386),
    ("Chilonzor", 41.2764, 69.2033),
    ("Mirobod", 41.2794, 69.2791),
    ("Mirzo Ulug'bek", 41.3253, 69.3350),
    ("Olmazor", 41.3522, 69.2233),
    ("Sergeli", 41.2222, 69.2167),
    ("Shayxontohur", 41.3264, 69.2236),
    ("Uchtepa", 41.2778, 69.1667),
    ("Yakkasaroy", 41.2833, 69.2500),
    ("Yashnobod", 41.2833, 69.3167),
    ("Yunusobod", 41.3667, 69.2833),
]

# Tez tanlash uchun yirik shaharlar
CITIES = [
    ("Toshkent", "Toshkent shahri", 41.3111, 69.2797),
    ("Samarqand", "Samarqand", 39.6542, 66.9597),
    ("Buxoro", "Buxoro", 39.7747, 64.4286),
    ("Andijon", "Andijon", 40.7833, 72.3333),
    ("Namangan", "Namangan", 40.9983, 71.6726),
    ("Farg'ona", "Farg'ona", 40.3842, 71.7843),
    ("Nukus", "Qoraqalpog'iston", 42.4531, 59.6103),
    ("Qarshi", "Qashqadaryo", 38.8606, 65.7891),
    ("Termiz", "Surxondaryo", 37.2242, 67.2783),
    ("Jizzax", "Jizzax", 40.1158, 67.8422),
    ("Navoiy", "Navoiy", 40.0844, 65.3792),
    ("Urganch", "Xorazm", 41.55, 60.6333),
    ("Guliston", "Sirdaryo", 40.4897, 68.7842),
    ("Qo'qon", "Farg'ona", 40.5286, 70.9425),
]


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: build-places.py <gadm41_UZB_2.json>")

    with io.open(sys.argv[1], encoding="utf-8") as handle:
        data = json.load(handle)

    districts: list[dict[str, object]] = []
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        name = (props.get("NAME_2") or "").strip()
        region_raw = (props.get("NAME_1") or "").strip()
        if not name or not region_raw or name == "TashkentCity":
            continue

        region = REGION_NAMES.get(region_raw, region_raw)
        point = feature_centroid(feature.get("geometry", {}))
        if point is None:
            continue

        districts.append(
            {
                "name": name,
                "region": region,
                "lat": point[0],
                "lon": point[1],
            }
        )

    existing = {(item["name"], item["region"]) for item in districts}
    for name, lat, lon in TASHKENT_DISTRICTS:
        if (name, "Toshkent shahri") in existing:
            continue
        districts.append({"name": name, "region": "Toshkent shahri", "lat": lat, "lon": lon})

    districts.sort(key=lambda item: (item["region"], item["name"]))

    cities = [{"name": n, "region": r, "lat": lat, "lon": lon} for n, r, lat, lon in CITIES]

    payload = {"cities": cities, "districts": districts}
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("/** Avtomatik yaratilgan — scripts/build-places.py (GADM 4.1). */\n\n")
        handle.write("export interface Place {\n")
        handle.write("  name: string;\n  region: string;\n  lat: number;\n  lon: number;\n}\n\n")
        handle.write("export interface PlaceData {\n")
        handle.write("  cities: Place[];\n  districts: Place[];\n}\n\n")
        handle.write(f"export const UZBEKISTAN_PLACES: PlaceData = {body};\n")

    regions = sorted({item["region"] for item in districts})
    print(f"cities={len(cities)} districts={len(districts)} regions={len(regions)} -> {OUT}")
    print(", ".join(regions))


if __name__ == "__main__":
    main()
