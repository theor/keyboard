# Trains the handwritten letter reader on EMNIST letters (a–z, capitals and
# small letters together) and writes its weights to src/data/letters.bin,
# read by src/handwriting.ts.
#
#   python3 -m venv venv && venv/bin/pip install torch torchvision
#   venv/bin/python scripts/train-letters.py path/to/emnist-dir
#
# The dataset is downloaded into that folder if it isn't there.

import struct
import sys
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision
import torchvision.transforms.v2 as T

OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'letters.bin'
EPOCHS = 12


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


# Shaky hands: tilted, slanted, moved, thicker or thinner strokes.
affine = T.RandomAffine(degrees=15, translate=(0.1, 0.1), scale=(0.8, 1.1), shear=12)


def augment(x):
    x = affine(x)
    r = torch.rand(len(x), 1, 1, 1, device=x.device)
    thick = F.max_pool2d(x, 3, 1, 1)
    thin = -F.max_pool2d(-x, 3, 1, 1)
    return torch.where(r < 0.25, thick, torch.where(r < 0.4, thin, x))


def main():
    root = sys.argv[1]
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    torch.manual_seed(0)
    xs, ys = load(root, True)
    xt, yt = load(root, False)
    xs, ys, xt, yt = xs.to(device), ys.to(device), xt.to(device), yt.to(device)
    print(f'mean ink: {xs.mean():.3f}')

    net = Net().to(device)
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    steps = EPOCHS * (len(xs) // 256)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 4e-3, total_steps=steps)
    for epoch in range(EPOCHS):
        net.train()
        perm = torch.randperm(len(xs), device=device)
        for i in range(0, len(xs) - 255, 256):
            idx = perm[i : i + 256]
            loss = F.cross_entropy(net(augment(xs[idx])), ys[idx], label_smoothing=0.05)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
        net.eval()
        with torch.no_grad():
            logits = torch.cat([net(xt[i : i + 1000]) for i in range(0, len(xt), 1000)])
            top1 = (logits.argmax(1) == yt).float().mean()
            top3 = (logits.topk(3).indices == yt[:, None]).any(1).float().mean()
        print(f'epoch {epoch + 1}: loss {loss.item():.3f}, test top-1 {top1:.3f}, top-3 {top3:.3f}')

    # Weights in order, float32 little-endian.
    with open(OUT, 'wb') as f:
        for name, p in net.state_dict().items():
            values = p.detach().cpu().flatten().tolist()
            f.write(struct.pack(f'<{len(values)}f', *values))
            print(name, tuple(p.shape))
    print(f'wrote {OUT} ({OUT.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
