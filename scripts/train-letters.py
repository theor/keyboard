# Trains the handwritten letter reader on EMNIST letters (a–z, capitals and
# small letters together) and writes its weights to src/data/letters.bin,
# read by src/handwriting.ts.
#
#   python3 -m venv venv && venv/bin/pip install torch torchvision
#   venv/bin/python scripts/train-letters.py path/to/emnist-dir
#
# The dataset is downloaded into that folder if it isn't there.
#
# To fit the patient's own hand, add the letters exported from the app's
# settings (one or more lettres-*.json files):
#
#   venv/bin/python scripts/train-letters.py path/to/emnist-dir lettres-*.json
#
# This starts from the current src/data/letters.bin and trains a little more on
# EMNIST and the patient's letters together, keeping a fifth of them aside to
# score the reader on that hand before and after.

import json
import random
import struct
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision
import torchvision.transforms.v2 as T

OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'letters.bin'
EPOCHS = 12
# Fitting to the patient's letters: fewer steps, gentler, and a quarter of each
# batch from their letters.
FIT_EPOCHS = 4
FIT_LR = 5e-4
FIT_SHARE = 64

# Keep in step with rasterize() in src/handwriting.ts.
SIZE = 28
BOX = 24
PEN = 1.1
EDGE = 1.4


class Net(nn.Module):
    # Keep in step with read() in src/handwriting.ts.
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 32, 3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, 3, padding=1)
        self.conv3 = nn.Conv2d(64, 64, 3, padding=1)
        self.fc1 = nn.Linear(64 * 3 * 3, 128)
        self.fc2 = nn.Linear(128, 26)
        self.drop = nn.Dropout(0.3)

    def forward(self, x):
        x = F.max_pool2d(F.relu(self.conv1(x)), 2)
        x = F.max_pool2d(F.relu(self.conv2(x)), 2)
        x = F.max_pool2d(F.relu(self.conv3(x)), 2)
        x = self.drop(F.relu(self.fc1(x.flatten(1))))
        return self.fc2(x)


def load(root, train):
    d = torchvision.datasets.EMNIST(root, split='letters', train=train, download=True)
    # EMNIST images are stored transposed.
    x = d.data.transpose(1, 2).unsqueeze(1).float() / 255
    return x, d.targets - 1


def rasterize(strokes):
    # Strokes as flat x, y lists in pad pixels, as the app exports them.
    pts = [np.array(s, dtype=np.float64).reshape(-1, 2) for s in strokes if s]
    every = np.concatenate(pts)
    low = every.min(0)
    w, h = every.max(0) - low
    scale = (BOX - 2 * PEN) / (max(w, h) or 1)
    middle = low + np.array([w, h]) / 2
    segs = []
    for p in pts:
        q = SIZE / 2 + (p - middle) * scale
        segs.append(np.stack([q[:1], q[:1]], 1) if len(q) == 1 else np.stack([q[:-1], q[1:]], 1))
    segs = np.concatenate(segs)
    a, d = segs[:, 0], segs[:, 1] - segs[:, 0]
    ys, xs = np.mgrid[0:SIZE, 0:SIZE] + 0.5
    p = np.stack([xs.ravel(), ys.ravel()], 1)[:, None, :]
    length = (d**2).sum(1)
    t = np.clip(((p - a) * d).sum(2) / np.where(length > 0, length, 1), 0, 1)
    dist = np.linalg.norm(p - a - t[..., None] * d, axis=2).min(1)
    return np.clip((PEN - dist) / EDGE + 0.5, 0, 1).reshape(1, SIZE, SIZE).astype(np.float32)


def load_patient(paths):
    samples = [s for path in paths for s in json.loads(Path(path).read_text())['samples']]
    random.Random(0).shuffle(samples)
    x = torch.from_numpy(np.stack([rasterize(s['strokes']) for s in samples]))
    y = torch.tensor([ord(s['letter']) - ord('a') for s in samples])
    held = len(samples) // 5
    counts = {src: sum(s['source'] == src for s in samples) for src in ('prompt', 'use')}
    print(f'{len(samples)} patient letters ({counts}), {held} kept aside')
    return x[held:], y[held:], x[:held], y[:held]


def load_weights(net):
    values = struct.unpack(f'<{OUT.stat().st_size // 4}f', OUT.read_bytes())
    at = 0
    state = net.state_dict()
    for name, p in state.items():
        state[name] = torch.tensor(values[at : at + p.numel()]).reshape(p.shape)
        at += p.numel()
    assert at == len(values), f'{OUT}: expected {at} weights, got {len(values)}'
    net.load_state_dict(state)


def score(net, x, y):
    if not len(x):
        return 'no letters'
    net.eval()
    with torch.no_grad():
        logits = torch.cat([net(x[i : i + 1000]) for i in range(0, len(x), 1000)])
    top1 = (logits.argmax(1) == y).float().mean()
    top3 = (logits.topk(3).indices == y[:, None]).any(1).float().mean()
    return f'top-1 {top1:.3f}, top-3 {top3:.3f}'


# Shaky hands: tilted, slanted, moved, thicker or thinner strokes.
affine = T.RandomAffine(degrees=15, translate=(0.1, 0.1), scale=(0.8, 1.1), shear=12)


def augment(x):
    x = affine(x)
    r = torch.rand(len(x), 1, 1, 1, device=x.device)
    thick = F.max_pool2d(x, 3, 1, 1)
    thin = -F.max_pool2d(-x, 3, 1, 1)
    return torch.where(r < 0.25, thick, torch.where(r < 0.4, thin, x))


def main():
    root, patient = sys.argv[1], sys.argv[2:]
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    torch.manual_seed(0)
    xs, ys = load(root, True)
    xt, yt = load(root, False)
    xs, ys, xt, yt = xs.to(device), ys.to(device), xt.to(device), yt.to(device)
    print(f'mean ink: {xs.mean():.3f}')

    net = Net().to(device)
    epochs, lr, share = EPOCHS, 4e-3, 0
    if patient:
        xp, yp, xh, yh = (v.to(device) for v in load_patient(patient))
        print(f'patient mean ink: {xp.mean():.3f}')
        load_weights(net)
        epochs, lr, share = FIT_EPOCHS, FIT_LR, FIT_SHARE
        print(f'before: test {score(net, xt, yt)}; patient {score(net, xh, yh)}')
    opt = torch.optim.AdamW(net.parameters(), lr / 2, weight_decay=1e-4)
    steps = epochs * (len(xs) // 256)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, lr, total_steps=steps)
    for epoch in range(epochs):
        net.train()
        perm = torch.randperm(len(xs), device=device)
        for i in range(0, len(xs) - 255, 256):
            idx = perm[i : i + 256 - share]
            x, y = xs[idx], ys[idx]
            if share:
                # The patient's letters are few, so they come back often, each time changed.
                pick = torch.randint(len(xp), (share,), device=device)
                x, y = torch.cat([x, xp[pick]]), torch.cat([y, yp[pick]])
            loss = F.cross_entropy(net(augment(x)), y, label_smoothing=0.05)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
        line = f'epoch {epoch + 1}: loss {loss.item():.3f}, test {score(net, xt, yt)}'
        print(line + (f'; patient {score(net, xh, yh)}' if patient else ''))

    # Weights in order, float32 little-endian.
    with open(OUT, 'wb') as f:
        for name, p in net.state_dict().items():
            values = p.detach().cpu().flatten().tolist()
            f.write(struct.pack(f'<{len(values)}f', *values))
            print(name, tuple(p.shape))
    print(f'wrote {OUT} ({OUT.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
