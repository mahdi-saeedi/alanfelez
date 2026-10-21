"""Renders the home-page metal pictures (apps/web/public/metals/<slug>.webp).

Our own images, made in code: a metal ingot (rebar for iron) with a brushed-metal surface, studio lighting and a soft
shadow on a pastel background. No stock photos, so no licence or duplicate-image questions. Re-run after changing a
look:  python3 tools/metal-images/render.py   (needs numpy and pillow)
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np
from PIL import Image

OUT_W, OUT_H, SS = 480, 600, int(os.environ.get("SS", 2))          # output size (portrait card) and supersampling for smooth edges
W, H = OUT_W * SS, OUT_H * SS
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "web", "public", "metals")

# metal colour (linear-ish RGB 0..1), roughness 0 (mirror) .. 1 (matte), background pastel top/bottom, shape
LOOKS = {
    "aluminum":  dict(color=(0.86, 0.88, 0.91), rough=0.25, bg=((0.90, 0.93, 0.97), (0.74, 0.79, 0.86)), shape="ingot"),
    "copper":    dict(color=(0.93, 0.55, 0.36), rough=0.22, bg=((0.99, 0.93, 0.88), (0.90, 0.78, 0.71)), shape="ingot"),
    "brass":     dict(color=(0.93, 0.78, 0.40), rough=0.20, bg=((0.99, 0.98, 0.86), (0.90, 0.87, 0.70)), shape="ingot"),
    "zinc":      dict(color=(0.74, 0.79, 0.84), rough=0.35, bg=((0.88, 0.95, 0.97), (0.70, 0.82, 0.86)), shape="ingot", spangle=True),
    "lead":      dict(color=(0.55, 0.57, 0.62), rough=0.55, bg=((0.91, 0.90, 0.97), (0.76, 0.74, 0.86)), shape="ingot"),
    "iron":      dict(color=(0.48, 0.47, 0.47), rough=0.45, bg=((0.88, 0.94, 0.97), (0.71, 0.80, 0.85)), shape="rebar"),
    "cast-iron": dict(color=(0.30, 0.30, 0.31), rough=0.80, bg=((0.92, 0.91, 0.94), (0.76, 0.75, 0.80)), shape="ingot", grit=True),
}


def norm(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def camera_rays():
    eye = np.array([0.0, 4.0, 5.7])
    target = np.array([0.0, 0.05, 0.0])
    fwd = norm(target - eye)
    right = norm(np.cross(fwd, [0, 1, 0]))
    up = np.cross(right, fwd)
    fov = math.radians(34)
    ys, xs = np.mgrid[0:H, 0:W]
    px = (xs + 0.5) / W * 2 - 1
    py = 1 - (ys + 0.5) / H * 2
    aspect = W / H
    d = fwd + right * (px[..., None] * math.tan(fov / 2) * aspect) + up * (py[..., None] * math.tan(fov / 2))
    return np.broadcast_to(eye, d.shape).copy(), norm(d)


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


class Ingot:
    """Trapezoidal ingot: a convex solid bounded by six planes (n·p <= d inside)."""

    def __init__(self, yaw=0.62, bevel=0.07):
        self.bevel = bevel
        lb, lt, wb, wt, h = 3.0, 2.55, 1.15, 0.80, 0.62
        self.R = rot_y(yaw)
        planes = [((0, 1, 0), h), ((0, -1, 0), 0.0)]
        for sx in (1, -1):
            n = np.array([sx * h, (lb - lt) / 2, 0.0]); n /= np.linalg.norm(n)
            planes.append((tuple(n), float(n @ np.array([sx * lb / 2, 0, 0]))))
        for sz in (1, -1):
            n = np.array([0.0, (wb - wt) / 2, sz * h]); n /= np.linalg.norm(n)
            planes.append((tuple(n), float(n @ np.array([0, 0, sz * wb / 2]))))
        self.N = np.array([p[0] for p in planes])
        self.D = np.array([p[1] for p in planes])

    def hit(self, o, d):
        o = o @ self.R; d = d @ self.R                          # world -> object (R is orthonormal)
        nd = d @ self.N.T; no = o @ self.N.T
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (self.D - no) / nd
        enter = np.where(nd < 0, t, -np.inf); exit_ = np.where(nd > 0, t, np.inf)
        outside = (nd == 0) & (no > self.D)
        t0 = enter.max(-1); t1 = exit_.min(-1)
        ok = (t0 <= t1) & (t1 > 1e-4) & ~outside.any(-1)
        t0 = np.where(t0 > 1e-4, t0, np.inf)
        ok &= np.isfinite(t0)
        idx = enter.argmax(-1)
        n_obj = self.N[idx]
        p_obj = o + d * np.where(ok, t0, 0)[..., None]
        # rounded edges: near another face, bend the normal toward it (a soft bevel catches the light)
        sdist = p_obj @ self.N.T - self.D
        np.put_along_axis(sdist, idx[..., None], -np.inf, -1)
        j = sdist.argmax(-1); near = np.take_along_axis(sdist, j[..., None], -1)[..., 0]
        w = np.clip(1 + near / self.bevel, 0, 1)[..., None]
        n_obj = norm(n_obj + w * self.N[j])
        return np.where(ok, t0, np.inf), n_obj @ self.R.T, p_obj, idx


class Rebars:
    """Three ribbed bars lying side by side (iron: rebar is the base product)."""

    def __init__(self, yaw=0.62, r=0.22, length=3.0):
        self.R = rot_y(yaw); self.r = r; self.half = length / 2
        self.centers = [(-0.62, r), (0.0, r), (0.62, r)]       # (z, y) of each bar axis, bars run along x

    def hit(self, o, d):
        o = o @ self.R; d = d @ self.R
        best = np.full(o.shape[:-1], np.inf); nrm = np.zeros_like(o); pos = np.zeros_like(o)
        for cz, cy in self.centers:
            oy, oz = o[..., 1] - cy, o[..., 2] - cz
            a = d[..., 1] ** 2 + d[..., 2] ** 2
            b = 2 * (oy * d[..., 1] + oz * d[..., 2])
            c = oy ** 2 + oz ** 2 - self.r ** 2
            disc = b * b - 4 * a * c
            with np.errstate(invalid="ignore", divide="ignore"):
                t = (-b - np.sqrt(np.maximum(disc, 0))) / (2 * a)
            x = o[..., 0] + t * d[..., 0]
            ok = (disc > 0) & (t > 1e-4) & (np.abs(x) < self.half) & (t < best)
            p = o + d * t[..., None]
            n = np.stack([np.zeros_like(x), p[..., 1] - cy, p[..., 2] - cz], -1) / self.r
            # flat cut ends (otherwise you'd look into an open tube)
            for sx in (1, -1):
                with np.errstate(invalid="ignore", divide="ignore"):
                    tc = (sx * self.half - o[..., 0]) / d[..., 0]
                pc = o + d * tc[..., None]
                inside = (pc[..., 1] - cy) ** 2 + (pc[..., 2] - cz) ** 2 < self.r ** 2
                cap = inside & (tc > 1e-4) & (tc < best) & (~ok | (tc < t))
                t = np.where(cap, tc, t); ok = ok | cap
                p = np.where(cap[..., None], pc, p)
                n = np.where(cap[..., None], np.array([sx, 0.0, 0.0]), n)
            # ribs: crescent ridges around the bar plus two long ribs, as a bump on the normal
            ang = np.arctan2(n[..., 1], n[..., 2])
            ph = p[..., 0] * 13 + np.sign(np.sin(ang)) * 0.8            # ribs on the two sides are offset
            rib = np.cos(ph) * np.sin(ph) ** 6 * 3.0 * (np.abs(np.cos(ang)) < 0.93)   # slope of a narrow ring
            n = norm(n + np.stack([rib, np.zeros_like(x), np.zeros_like(x)], -1))
            best = np.where(ok, t, best)
            nrm = np.where(ok[..., None], n, nrm); pos = np.where(ok[..., None], p, pos)
        return best, nrm @ self.R.T, pos, np.zeros(best.shape, int)


def env(r, bg_bottom):
    """Studio light probe: a big softbox above, a strip light on one side, the coloured floor below."""
    up = np.clip(r[..., 1], -1, 1)
    sky = 0.32 + 0.95 * (1 / (1 + np.exp(-(up - 0.55) * 14)))          # dark around the horizon, bright softbox above
    strip = np.exp(-((r[..., 0] + 0.75) ** 2) / 0.015) * (up > -0.05) * 1.2   # tall strip light on one side
    kick = np.exp(-((r[..., 0] - 0.8) ** 2) / 0.05) * np.exp(-((up - 0.2) ** 2) / 0.05) * 0.6
    floor = np.array(bg_bottom) * 0.8
    e = np.where((up < 0)[..., None], floor * (1 + up[..., None] * 0.3), (sky + strip + kick)[..., None])
    return e


def noise1(x, seed):
    rng = np.random.default_rng(seed)
    freq = rng.uniform(40, 260, 24); phase = rng.uniform(0, 6.3, 24); amp = rng.uniform(0.2, 1, 24)
    s = sum(a * np.sin(x * f + p) for a, f, p in zip(amp, freq, phase))
    return s / amp.sum()


def render(slug, look):
    o, d = camera_rays()
    obj = Rebars() if look["shape"] == "rebar" else Ingot()
    t, n, p_obj, face = obj.hit(o, d)
    hit = np.isfinite(t)
    light = norm(np.array([-0.6, 1.0, 0.35]))
    top, bottom = np.array(look["bg"][0]), np.array(look["bg"][1])

    # background / floor: vertical pastel gradient (the card colour), soft shadow where the floor is blocked
    yy = np.linspace(0, 1, H)[:, None, None]
    img = top * (1 - yy) + bottom * yy
    img = np.broadcast_to(img, (H, W, 3)).copy()
    with np.errstate(divide="ignore", invalid="ignore"):
        tg = -o[..., 1] / d[..., 1]
    floor = (~hit) & (tg > 0)
    fp = o + d * np.where(floor, tg, 0)[..., None]
    shade = np.zeros((H, W))
    rng = np.random.default_rng(7)
    k = 18
    fpf = fp[floor]
    occ = np.zeros(len(fpf))
    for _ in range(k):
        ld = norm(light + rng.normal(0, 0.16, 3))
        ts, *_ = obj.hit(fpf + ld * 1e-3, np.broadcast_to(ld, fpf.shape).copy())
        occ += np.isfinite(ts)
    shade[floor] = occ / k
    img *= (1 - 0.38 * shade)[..., None]

    # metal
    if hit.any():
        nn, dd = n[hit], d[hit]
        r = dd - 2 * (dd * nn).sum(-1, keepdims=True) * nn
        rough = look["rough"]
        col = np.array(look["color"])
        brushed = noise1(p_obj[hit][:, 2] * 3 + p_obj[hit][:, 1] * 5, sum(map(ord, slug)))  # streaks along the length
        if look.get("spangle"):
            cells = np.random.default_rng(3).uniform(-1.5, 1.5, (60, 2))
            q = p_obj[hit][:, [0, 2]]
            dist = ((q[:, None, :] - cells[None]) ** 2).sum(-1)
            brushed = brushed * 0.3 + (np.argmin(dist, 1) % 5 - 2) * 0.35
        if look.get("grit"):
            brushed = brushed * 0.4 + np.random.default_rng(5).normal(0, 0.9, len(brushed))
        refl = env(norm(r + np.random.default_rng(11).normal(0, rough * 0.07, r.shape)), bottom)
        ndl = np.clip((nn * light).sum(-1), 0, 1)[:, None]
        spec = np.clip((norm(r) * light).sum(-1), 0, 1)[:, None] ** (8 + 120 * (1 - rough))
        fres = 0.9 + 0.1 * (1 - np.abs((nn * dd).sum(-1)))[:, None] ** 5
        c = col * (refl * (1 - rough) * fres + (0.25 + 0.75 * ndl) * rough * 0.9)
        c += spec * (1.1 - rough) * 0.9
        c *= (1 + 0.10 * brushed)[:, None]
        if look["shape"] == "ingot":                         # a slightly darker bottom band, like a cast edge
            c *= np.where((face[hit] == 1)[:, None], 0.6, 1.0)
        img[hit] = c

    img = np.clip(img, 0, 1) ** (1 / 1.15)
    im = Image.fromarray((img * 255).astype(np.uint8)).resize((OUT_W, OUT_H), Image.LANCZOS)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{slug}.webp")
    im.save(path, "WEBP", quality=82, method=6)
    return path


if __name__ == "__main__":
    for slug in (sys.argv[1:] or LOOKS):
        print(render(slug, LOOKS[slug]))
